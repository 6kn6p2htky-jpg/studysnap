
export default async req => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });

  let key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { error: "Configure OPENAI_API_KEY dans Netlify." });

  try {
    let { images = [], format = "Fiche de révision", correction = "" } = await req.json();
    if (!images.length) return json(400, { error: "Aucune photo reçue" });
    if (images.length > 10) return json(400, { error: "10 photos maximum" });

    let specs = {
      "Fiche de révision": "Fais une fiche organisée avec titres, définitions et résumé.",
      "Carte mentale": "Fais une carte mentale textuelle hiérarchisée avec branches.",
      "Schéma": "Fais un schéma textuel avec étapes et flèches.",
      "Flashcards": "Crée 8 à 12 flashcards concises. Remplis le tableau cards avec front (question) et back (réponse)."
    };

    let content = [{
      type: "input_text",
      text: `Tu es StudySnap, assistant pédagogique. Lis les photos sans inventer. Si un passage important est illisible ou ambigu, demande une clarification au lieu de deviner. Format : ${format}. ${specs[format] || specs["Fiche de révision"]} Correction de l'élève : ${correction || "aucune"}. Réponds uniquement en JSON valide avec champs {"status":"ok" ou "needs_clarification","title":"...","content":"...","cards":[{"front":"question","back":"réponse"}],"unclearPassage":"...","clarificationQuestion":"..."}. Pour les formats autres que Flashcards, cards=[]; pour Flashcards, donne 8 à 12 cartes. Si clarification nécessaire, status=needs_clarification et demande précisément le passage. Sinon status=ok. Français clair, fidèle au cours.`
    }];

    for (let im of images) {
      if (typeof im !== "string" || !im.startsWith("data:image/"))
        return json(400, { error: "Image invalide" });
      content.push({ type: "input_image", image_url: im });
    }

    let r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content }],
        text: { format: { type: "json_object" } }
      })
    });

    let d = await r.json();
    if (!r.ok) return json(r.status, { error: d.error?.message || "Erreur du service IA" });

    let out = (d.output || [])
      .flatMap(x => x.content || [])
      .find(x => x.type === "output_text")?.text;

    if (!out) return json(502, { error: "Réponse IA vide" });

    return new Response(out, {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  } catch (e) {
    return json(500, { error: e.message || "Erreur interne" });
  }
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
