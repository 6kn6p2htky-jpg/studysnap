
import mammoth from "mammoth";

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return json(500, {
      error: "La variable GEMINI_API_KEY n'est pas configurée dans Netlify."
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
      return json(400, {
        error: "Aucun fichier reçu. Sélectionne un document ou une photo."
      });
    }

    if (attachments.length > 10) {
      return json(400, { error: "10 fichiers maximum." });
    }

    const instructions = {
      "Fiche de révision":
        "Crée une fiche structurée avec titres, notions clés, définitions et résumé.",
      "Carte mentale":
        "Crée une carte mentale hiérarchisée avec un sujet central et ses branches.",
      "Schéma":
        "Crée un schéma clair avec étapes, liens et flèches.",
      "Flashcards":
        "Crée 8 à 12 flashcards avec une question et une réponse."
    };

    const parts = [{
      text: `Tu es StudySnap, un assistant pédagogique.

Analyse fidèlement les documents fournis.
N'invente aucune information.
Si une partie importante est illisible ou ambiguë,
demande une clarification à l'utilisateur.

Format demandé : ${format}.
Consigne : ${instructions[format] || instructions["Fiche de révision"]}
Correction de l'utilisateur : ${correction || "Aucune"}.

Réponds uniquement en JSON valide avec cette structure :
{
  "status": "ok",
  "title": "Titre",
  "content": "Contenu détaillé",
  "cards": [
    {"front": "Question", "back": "Réponse"}
  ],
  "unclearPassage": "",
  "clarificationQuestion": ""
}

Si une clarification est nécessaire, utilise
"status": "needs_clarification",
et indique le passage concerné ainsi que la question à poser.

Pour Flashcards, crée 8 à 12 cartes.
Pour les autres formats, cards doit être un tableau vide.
Réponds en français clair et adapté à un élève.`
    }];

    for (const file of attachments) {
      if (
        !file ||
        typeof file.data !== "string" ||
        typeof file.name !== "string"
      ) {
        return json(400, { error: "Fichier invalide." });
      }

      if (file.data.length > 5500000) {
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

      const mime = (
        file.type || match[1] || ""
      ).toLowerCase();

      const buffer = Buffer.from(match[2], "base64");
      const ext = (
        file.name.split(".").pop() || ""
      ).toLowerCase();

      // PHOTOS ET IMAGES
      if (
        mime.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
      ) {
        const imageMime = mime || "image/jpeg";

        parts.push({
          inlineData: {
            mimeType: imageMime,
            data: match[2]
          }
        });
      }

      // DOCUMENT WORD
      else if (
        ext === "docx" ||
        mime.includes("wordprocessingml.document")
      ) {
        const extracted = await mammoth.extractRawText({
          buffer
        });

        const text = (extracted.value || "").trim();

        if (!text) {
          return json(422, {
            error: `Aucun texte lisible trouvé dans ${file.name}.`
          });
        }

        parts.push({
          text: `CONTENU DU DOCUMENT WORD ${file.name} :\n${text}`
        });
      }

      // FICHIERS TEXTE
      else if (["txt", "md", "csv"].includes(ext)) {
        parts.push({
          text: `CONTENU DU FICHIER ${file.name} :\n${buffer.toString("utf8")}`
        });
      }

      // DOCUMENT PDF
      else if (ext === "pdf" || mime === "application/pdf") {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: match[2]
          }
        });
      }

      // FORMAT NON PRIS EN CHARGE
      else {
        return json(415, {
          error: `Format non pris en charge : ${ext || mime}. Utilise Word (.docx), PDF, TXT, CSV ou une image.`
        });
      }
    }

    // APPEL À GEMINI 3.8 FLASH
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return json(response.status, {
        error:
          data.error?.message ||
          "Le service Gemini a rencontré une erreur."
      });
    }

    const output = data.candidates?.[0]?.content?.parts
      ?.find(part => typeof part.text === "string")?.text;

    if (!output) {
      return json(502, {
        error: "Gemini n'a renvoyé aucun résultat. Réessaie."
      });
    }

    // VÉRIFICATION DU JSON
    let result;

    try {
      result = JSON.parse(output);
    } catch {
      return json(502, {
        error: "La réponse de Gemini n'est pas un JSON valide."
      });
    }

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    });

  } catch (error) {
    console.error("StudySnap error:", error);

    return json(500, {
      error:
        "Erreur pendant la lecture du document : " +
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
