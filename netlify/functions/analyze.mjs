
import mammoth from "mammoth";

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json(500, {
      error: "La variable GEMINI_API_KEY est absente de Netlify."
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
        "Crée 8 à 12 flashcards. Remplis cards avec front (question) et back (réponse)."
    };

    const parts = [{
      text: `Tu es StudySnap, assistant pédagogique.
Analyse fidèlement les documents fournis sans inventer.
Si une partie importante est illisible ou ambiguë,
demande une clarification.

Format demandé : ${format}.
Consigne : ${specs[format] || specs["Fiche de révision"]}
Correction : ${correction || "aucune"}.

Réponds uniquement en JSON valide avec les champs :
{
 "status":"ok ou needs_clarification",
 "title":"titre",
 "content":"contenu",
 "cards":[{"front":"question","back":"réponse"}],
 "unclearPassage":"passage incertain",
 "clarificationQuestion":"question à poser"
}

Pour Flashcards, crée 8 à 12 cartes.
Pour les autres formats, cards doit être un tableau vide.
Si une clarification est nécessaire, utilise
status = needs_clarification.
Réponds en français clair.`
    }];

    for (const file of attachments) {
      if (!file || typeof file.data !== "string" ||
          typeof file.name !== "string") {
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

      const mime = (file.type || match[1] || "")
        .toLowerCase();
      const buffer = Buffer.from(match[2], "base64");
      const ext = (file.name.split(".").pop() || "")
        .toLowerCase();

      if (
        mime.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)
      ) {
        parts.push({
          inlineData: {
            mimeType: mime || "image/jpeg",
            data: match[2]
          }
        });
      } else if (
        ext === "docx" ||
        mime.includes("wordprocessingml.document")
      ) {
        const extracted = await mammoth.extractRawText({ buffer });
        const text = (extracted.value || "").trim();

        if (!text) {
          return json(422, {
            error: `Aucun texte lisible dans ${file.name}.`
          });
        }

        parts.push({
          text: `CONTENU DU DOCUMENT WORD ${file.name} :\n${text}`
        });
      } else if (["txt", "md", "csv"].includes(ext)) {
        parts.push({
          text: `CONTENU DU FICHIER ${file.name} :\n${buffer.toString("utf8")}`
        });
      } else if (ext === "pdf" || mime === "application/pdf") {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: match[2]
          }
        });
      } else {
        return json(415, {
          error: `Format non pris en charge : ${ext || mime}.`
        });
      }
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts
          }],
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
      console.error("Gemini error:", data);
      return json(response.status, {
        error: data.error?.message || "Erreur de l'API Gemini."
      });
    }

    const output = data.candidates?.[0]?.content?.parts
      ?.find(part => part.text)?.text;

    if (!output) {
      return json(502, {
        error: "Gemini n'a renvoyé aucun résultat."
      });
    }

    return new Response(output, {
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    });

  } catch (error) {
    console.error("StudySnap error:", error);
    return json(500, {
      error: "Erreur de lecture : " + (error.message || "inconnue")
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
