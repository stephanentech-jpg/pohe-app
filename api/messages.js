// POHE — Proxy IA sécurisé (Vercel Serverless Function)
// Ce fichier reçoit les requêtes de l'application et les transmet à Anthropic
// La clé API reste sur le serveur — jamais visible par les utilisateurs

export default async function handler(req, res) {
  // Autoriser uniquement les requêtes POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  // Vérifier la présence de la clé API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Clé API non configurée. Ajoutez ANTHROPIC_API_KEY dans les variables d'environnement Vercel."
    });
  }

  try {
    // Transmettre la requête à Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    // En cas d'erreur Anthropic, renvoyer le même code
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: "Erreur serveur : " + error.message });
  }
}
