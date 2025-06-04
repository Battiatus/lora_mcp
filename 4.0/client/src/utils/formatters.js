/**
 * Formate le texte markdown en HTML
 * @param {string} text - Texte à formater
 * @returns {string} HTML formaté
 */
export const formatMarkdown = (text) => {
  if (!text) return '';
  
  // Remplacer les liens
  text = text.replace(
    /(https?:\/\/[^\s]+)/g, 
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>'
  );
  
  // Remplacer les blocs de code
  text = text.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-gray-100 p-3 rounded font-mono text-sm overflow-x-auto">$1</pre>'
  );
  
  // Remplacer les lignes de code inline
  text = text.replace(
    /`([^`]+)`/g, 
    '<code class="bg-gray-100 px-1 py-0.5 rounded font-mono text-sm">$1</code>'
  );
  
  // Remplacer le texte en gras
  text = text.replace(
    /\*\*([^*]+)\*\*/g, 
    '<strong>$1</strong>'
  );
  
  // Remplacer le texte en italique
  text = text.replace(
    /\*([^*]+)\*/g, 
    '<em>$1</em>'
  );
  
  // Remplacer les titres
  text = text.replace(
    /^### (.*$)/gm,
    '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>'
  );
  
  text = text.replace(
    /^## (.*$)/gm,
    '<h2 class="text-xl font-semibold mt-5 mb-3">$1</h2>'
  );
  
  text = text.replace(
    /^# (.*$)/gm,
    '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>'
  );
  
  // Remplacer les listes non ordonnées
  text = text.replace(
    /^\* (.*$)/gm,
    '<li class="ml-4">$1</li>'
  );
  
  // Remplacer les listes ordonnées
  text = text.replace(
    /^\d+\. (.*$)/gm,
    '<li class="ml-4">$1</li>'
  );
  
  // Grouper les éléments de liste
  text = text.replace(
    /(<li.*<\/li>)\s*<li/g,
    '$1<li'
  );
  
  // Envelopper les listes dans des balises ul/ol
  text = text.replace(
    /(<li class="ml-4">.*<\/li>)/g,
    '<ul class="list-disc my-2">$1</ul>'
  );
  
  // Remplacer les sauts de ligne par des balises <br>
  text = text.replace(/\n/g, '<br>');
  
  return text;
};

/**
 * Tronque un texte et ajoute des points de suspension si nécessaire
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string} Texte tronqué
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};