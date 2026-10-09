# Suivi Nutrition

Web app (HTML/CSS/JS, sans serveur) qui calcule les valeurs nutritionnelles de vos repas avec l'API Gemini, suit vos kcal et garde l'historique de tous vos repas.

## Utilisation

```bash
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

1. Ouvrez **Réglages** et collez votre clé API Gemini (stockée uniquement dans votre navigateur).
2. Décrivez un repas (ou ajoutez une photo) → **Calculer les valeurs** → **Enregistrer**.
3. Le total du jour, les macros et l'historique sur 7 jours se mettent à jour. Données stockées en `localStorage`, export JSON disponible.

> Ne committez jamais votre clé API dans le dépôt.
