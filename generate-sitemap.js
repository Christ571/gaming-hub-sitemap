import fetch from 'node-fetch';
import fs from 'fs';

const SHOPIFY_DOMAIN = 'gaming-hub.myshopify.com';
const ADMIN_TOKEN = process.env.SHOPIFY_TOKEN;
const BLOG_HANDLE = 'films-et-cinematiques-de-jeux-videos';
const OUTPUT_FILE = 'sitemap-videos.xml';

console.log('🚀 Génération du sitemap vidéo...');
console.log('📡 Token présent:', ADMIN_TOKEN ? 'Oui' : 'Non');

async function fetchVideos() {
  console.log('📡 Récupération des vidéos depuis Shopify Admin API...');
  
  // Requête simplifiée - juste les métaobjets
  const query = `
    query {
      metaobjects(type: "video_youtube", first: 250) {
        nodes {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    }
  `;
  
  console.log('🔍 Envoi de la requête GraphQL...');
  
  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN
    },
    body: JSON.stringify({ query })
  });

  console.log('📥 Statut de la réponse:', response.status, response.statusText);

  const data = await response.json();
  
  if (data.errors) {
    console.error('❌ Erreur GraphQL:', JSON.stringify(data.errors, null, 2));
    console.error('📄 Réponse complète:', JSON.stringify(data, null, 2));
    throw new Error('Erreur lors de la récupération des vidéos');
  }

  if (!data.data || !data.data.metaobjects) {
    console.error('❌ Structure de réponse invalide:', JSON.stringify(data, null, 2));
    throw new Error('Réponse API invalide');
  }

  console.log(`✅ ${data.data.metaobjects.nodes.length} métaobjets trouvés`);
  return data.data.metaobjects.nodes;
}

function parseMetaobject(node) {
  const video = {};
  node.fields.forEach(field => {
    video[field.key] = field.value;
  });
  return video;
}

function convertDurationToSeconds(duration) {
  if (!duration) return 0;
  const parts = duration.split(':').map(p => parseInt(p, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateSitemap(videos) {
  console.log(`📝 Génération du XML pour ${videos.length} vidéos...`);
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>https://gaming-hub.fr/blogs/${BLOG_HANDLE}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
`;

  videos.forEach(video => {
    const videoId = video.id_video;
    if (!videoId) return;

    const title = escapeXml(video.titre || 'Vidéo Gaming Hub');
    const description = escapeXml(`Découvrez la vidéo complète du jeu ${video.titre || ''} en 4K. Ce montage comprend toutes les cinématiques et séquences principales du jeu.`);
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const contentUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const playerUrl = `https://www.youtube.com/embed/${videoId}`;
    const duration = convertDurationToSeconds(video.duration);
    const pubDate = video.date_publication ? `${video.date_publication}T08:00:00+01:00` : new Date().toISOString();
    const tag = escapeXml(video.tag || 'Gaming');

    xml += `    <video:video>
      <video:thumbnail_loc>${thumbnailUrl}</video:thumbnail_loc>
      <video:title>${title} Toutes les cinématiques Film complet en français</video:title>
      <video:description>${description}</video:description>
      <video:content_loc>${contentUrl}</video:content_loc>
      <video:player_loc>${playerUrl}</video:player_loc>
`;

    if (duration > 0) xml += `      <video:duration>${duration}</video:duration>\n`;

    xml += `      <video:publication_date>${pubDate}</video:publication_date>
      <video:tag>${tag}</video:tag>
      <video:family_friendly>no</video:family_friendly>
      <video:live>no</video:live>
    </video:video>
`;
  });

  xml += `  </url>
</urlset>`;

  return xml;
}

async function main() {
  try {
    const nodes = await fetchVideos();
    const videos = nodes.map(parseMetaobject).filter(v => v.id_video);
    console.log(`✅ ${videos.length} vidéos valides avec id_video`);

    if (videos.length === 0) {
      console.warn('⚠️ Aucune vidéo valide trouvée!');
      console.log('📋 Premier métaobjet (debug):', JSON.stringify(nodes[0], null, 2));
    }

    const xml = generateSitemap(videos);
    fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
    console.log(`✅ Sitemap généré : ${OUTPUT_FILE}`);
    console.log(`📊 Taille : ${(xml.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
