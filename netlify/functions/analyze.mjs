
import mammoth from "mammoth";

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const key = process.env.EDENAI_API_KEY;
  if (!key) {
    return json(500, {
      error: "La variable EDENAI_API_KEY est absente de Netlify."
    });
  }

  try {
    const body = await req.json();
    const format = body.format || "Fiche de révision";
    const correction = body.correction || "";

    const attachments = Array.isArray(body.attachments)
      ? body.attachments
      : Array.isArray(body.images)
        ? body.images.map((data, i) => ({
            name: `photo-${i + 1}.jpg`,
            type: "image/jpeg",
            data
          }))
        : [];

    if (!attachments.length) {
      return json(400, { error: "Aucun fichier reçu." });
    }

    if (attachments.length > 10) {
      return json(400, { error: "10 fichiers maximum." });
    }

    const specs = {
      "Fiche de révision":
        "Crée une fiche structurée avec titres, notions clés, définitions et résumé.",
      "Carte mentale":
        "Crée une carte mentale textuelle hiérarchisée avec un sujet central et ses branches.",
      "Schéma":
        "Crée un schéma textuel clair avec étapes, liens et flèches.",
      "Flashcards":
        "Crée 8 à 12 flashcards avec une question et une réponse."
    };

    const content = [{
      type: "text",
      text: `Tu es StudySnap, assistant pédagogique.
Analyse fidèlement le contenu fourni, sans inventer.
Si une partie importante est ambiguë ou illisible, demande une clarification.
Format : ${format}.
${specs[format] || specs["Fiche de révision"]}
Correction : ${correction || "aucune"}.

Réponds uniquement en JSON valide avec les champs :
{"status":"ok","title":"...","content":"...","cards":[{"front":"question","back":"réponse"}],"unclearPassage":"...","clarificationQuestion":"..."}

Pour Flashcards, fournis 8 à 12 cartes.
Pour les autres formats, cards=[].
Si une clarification est nécessaire, status="needs_clarification".
Français clair et fidèle au cours.`
    }];

    for (const file of attachments) {
      if (!file || typeof file.data !== "string" ||
          typeof file.name !== "string") {
        return json(400, { error: "Fichier invalide." });
      }

      if (file.data.length > 5_500_000) {
        return json(413, {
          error: `Fichier trop volumineux : ${file.name}.`
        });
      }

      const match = file.data.match(
        /^data:([^;,]+)?;base64,([\s\S]+)$/
      );

      if (!match) {
        return json(400, {
          error: `Impossible de lire ${file.name}.`
        });
      }

      const mime = (file.type || match[1] || "").toLowerCase();
      const buffer = Buffer.from(match[2], "base64");
      const ext = (file.name.split(".").pop() || "").toLowerCase();

      if (
        mime.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp"].includes(ext)
      ) {
        content.push({
          type: "image_url",
          image_url: { url: file.data }
        });
      } else if (
        ext === "docx" ||
        mime.includes("wordprocessingml.document")
      ) {
        const extracted = await mammoth.extractRawText({ buffer });
        const text = (extracted.value || "").trim();

        if (!text) {
          return json(422, {
            error: `Aucun texte lisible trouvé dans ${file.name}.`
          });
        }

        content.push({
          type: "text",
          text: `CONTENU DU DOCUMENT WORD ${file.name} :\n${text}`
        });
      } else if (["txt", "md", "csv"].includes(ext)) {
        content.push({
          type: "text",
          text: `CONTENU DU FICHIER ${file.name} :\n${buffer.toString("utf8")}`
        });
      } else {
        return json(415, {
          error: `Le format ${ext || mime} n'est pas encore pris en charge par cette version.`
        });
      }
    }

    const response = await fetch(
      "https://api.edenai.run/v3/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          model: process.env.EDENAI_MODEL || "openai/gpt-4o-mini",
          messages: [
            {
              role: "user",
              content
            }
          ],
          response_format: { type: "json_object" },
          stream: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Eden AI error:", data);
      return json(response.status, {
        error: data.message || data.error?.message ||
          "Eden AI n'a pas accepté la demande. Vérifie le modèle et les crédits."
      });
    }

    const output = data.choices?.[0]?.message?.content;

    if (!output) {
      return json(502, { error: "La réponse d'Eden AI est vide." });
    }

    const cleaned = output
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();

    const result = JSON.parse(cleaned);

    return json(200, result);

  } catch (error) {
    console.error("StudySnap Eden AI error:", error);
    return json(500, {
      error: "Erreur pendant la lecture du document : " +
        (error.message || "erreur inconnue")
    });
  }
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
