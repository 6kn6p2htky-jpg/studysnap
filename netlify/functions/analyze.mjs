import mammoth from "mammoth";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(500, { error: "La clé OPENAI_API_KEY n'est pas configurée dans Netlify." });

  try {
    const body = await req.json();
    const format = body.format || "Fiche de révision";
    const correction = body.correction || "";
    // Supporte le format actuel (attachments) et l'ancien format (images).
    const attachments = Array.isArray(body.attachments) ? body.attachments :
      Array.isArray(body.images) ? body.images.map((data, i) => ({ name: `photo-${i + 1}.jpg`, type: "image/jpeg", data })) : [];
    if (!attachments.length) return json(400, { error: "Aucun fichier reçu. Sélectionne un document ou une photo, puis réessaie." });
    if (attachments.length > 10) return json(400, { error: "10 fichiers maximum." });

    const specs = {
      "Fiche de révision": "Crée une fiche structurée avec titres, notions clés, définitions et résumé.",
      "Carte mentale": "Crée une carte mentale textuelle hiérarchisée avec un sujet central et ses branches.",
      "Schéma": "Crée un schéma textuel clair avec étapes, liens et flèches.",
      "Flashcards": "Crée 8 à 12 flashcards. Remplis cards avec front (question) et back (réponse)."
    };
    const content = [{ type: "input_text", text: `Tu es StudySnap, assistant pédagogique. Analyse fidèlement le contenu fourni, sans inventer. Si une partie importante est ambiguë ou illisible, demande une clarification. Format : ${format}. ${specs[format] || specs["Fiche de révision"]} Correction : ${correction || "aucune"}. Réponds uniquement en JSON valide avec les champs {"status":"ok" ou "needs_clarification","title":"...","content":"...","cards":[{"front":"question","back":"réponse"}],"unclearPassage":"...","clarificationQuestion":"..."}. Pour Flashcards, fournis 8 à 12 cartes. Pour les autres formats, cards=[]. Si clarification nécessaire, status=needs_clarification. Français clair et fidèle au cours.` }];

    for (const file of attachments) {
      if (!file || typeof file.data !== "string" || typeof file.name !== "string") return json(400, { error: "Fichier invalide." });
      if (file.data.length > 5_500_000) return json(413, { error: `Fichier trop volumineux : ${file.name}.` });
      const match = file.data.match(/^data:([^;,]+)?;base64,([\s\S]+)$/);
      if (!match) return json(400, { error: `Impossible de lire ${file.name}. Réessaie de sélectionner le fichier.` });
      const mime = (file.type || match[1] || "").toLowerCase();
      const buffer = Buffer.from(match[2], "base64");
      const ext = (file.name.split(".").pop() || "").toLowerCase();

      if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
        content.push({ type: "input_image", image_url: file.data });
      } else if (ext === "docx" || mime.includes("wordprocessingml.document")) {
        const extracted = await mammoth.extractRawText({ buffer });
        const text = (extracted.value || "").trim();
        if (!text) return json(422, { error: `Aucun texte lisible trouvé dans ${file.name}. Essaie de l'enregistrer à nouveau au format .docx ou en PDF.` });
        content.push({ type: "input_text", text: `CONTENU DU DOCUMENT WORD « ${file.name} » :\n${text}` });
      } else if (["txt", "md", "csv"].includes(ext)) {
        content.push({ type: "input_text", text: `CONTENU DU FICHIER « ${file.name} » :\n${buffer.toString("utf8")}` });
      } else if (ext === "pdf" || mime === "application/pdf") {
        content.push({ type: "input_file", filename: file.name, file_data: file.data });
      } else {
        return json(415, { error: `Le format ${ext || mime} n'est pas encore pris en charge. Pour l'instant, utilise Word (.docx), PDF, TXT, CSV ou une image.` });
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: [{ role: "user", content }], text: { format: { type: "json_object" } } })
    });
    const data = await response.json();
    if (!response.ok) return json(response.status, { error: data.error?.message || "Le service IA a refusé le document." });
    const output = (data.output || []).flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
    if (!output) return json(502, { error: "La réponse de l'IA est vide. Réessaie." });
    return new Response(output, { headers: { "Content-Type": "application/json; charset=utf-8" } });
  } catch (error) {
    console.error("StudySnap analyze error:", error);
    return json(500, { error: "Erreur pendant la lecture du document : " + (error.message || "erreur inconnue") });
  }
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
