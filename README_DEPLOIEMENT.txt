STUDYSNAP — VERSION NETLIFY AVEC BIBLIOTHÈQUE

NOUVEAUTÉS
- Mes fiches : bibliothèque avec recherche et filtres par type.
- Flashcards : paquets enregistrés, réponses à révéler et navigation carte par carte.
- Visuels : cartes mentales et schémas regroupés.
- Créer : génération IA de nouveaux supports.

Les supports sont enregistrés dans le stockage local du navigateur sur cet iPhone. Ils ne sont pas synchronisés entre appareils et peuvent être supprimés si les données Safari sont effacées.

DÉPLOIEMENT
1. Décompresse le ZIP.
2. Ouvre https://app.netlify.com/ et déploie le dossier ou relie un dépôt Git.
3. Dans les paramètres du site, ajoute la variable d'environnement OPENAI_API_KEY avec ta clé API.
4. Facultatif : OPENAI_MODEL = gpt-4.1-mini.
5. Relance le déploiement.
6. Ouvre l'adresse HTTPS dans Safari sur l'iPhone.
7. Safari > Partager > Sur l'écran d'accueil > Ajouter.

La clé API doit rester dans les variables Netlify, jamais dans le code du navigateur. L'API OpenAI peut être payante et n'est pas incluse automatiquement dans l'abonnement ChatGPT. Les photos sont transmises à OpenAI pour analyse. La génération nécessite Internet.
