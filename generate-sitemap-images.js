import fetch from 'node-fetch';
import fs from 'fs';

const SHOPIFY_DOMAIN = 'gaming-hub.fr';
const STOREFRONT_TOKEN = process.env.SHOPIFY_TOKEN;
const OUTPUT_FILE = 'sitemap-images.xml';
const API_VERSION = '2022-10';

console.log('🖼️ Génération du sitemap images...');

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractImageFromUrl(url) {
  if (!url) return null;
  
  // Nettoyer l'URL et s'assurer qu'elle est en HTTPS
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) {
    cleanUrl = 'https:' + cleanUrl;
  } else if (!cleanUrl.startsWith('http')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  
  return cleanUrl;
}

async function fetchAllBlogs() {
  console.log('📚 Récupération de tous les blogs...');
  
  const query = `{
    blogs(first: 10) {
      edges {
        node {
          id
          handle
          title
          articles(first: 250) {
            edges {
              node {
                id
                handle
                title
                image {
                  url
                  altText
                }
                content
              }
            }
          }
        }
      }
    }
  }`;
  
  const url = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error('❌ Erreur GraphQL:', data.errors);
    throw new Error('Erreur lors de la récupération des blogs');
  }

  return data.data.blogs.edges.map(edge => edge.node);
}

async function fetchMetaobjectImages() {
  console.log('🎮 Récupération des images des métaobjets jeux...');
  
  const query = `{
    metaobjects(type: "nouveautes_jeux_videos", first: 250) {
      nodes {
        handle
        fields {
          key
          value
        }
      }
    }
  }`;
  
  const url = `https://${SHOPIFY_DOMAIN}/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  
  if (data.errors) {
    console.warn('⚠️ Erreur métaobjets (ignorée):', data.errors);
    return [];
  }

  return data.data?.metaobjects?.nodes || [];
}

function generateSitemap(blogs, metaobjects) {
  console.log(`📝 Génération du XML...`);
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

  let totalImages = 0;

  // Ajouter les articles de blog avec leurs images
  blogs.forEach(blog => {
    blog.articles.edges.forEach(articleEdge => {
      const article = articleEdge.node;
      const articleUrl = `https://gaming-hub.fr/blogs/${blog.handle}/${article.handle}`;
      
      // Collecter toutes les images de l'article
      const images = [];
      
      // Image principale de l'article
      if (article.image?.url) {
        const imageUrl = extractImageFromUrl(article.image.url);
        if (imageUrl) {
          images.push({
            loc: imageUrl,
            title: escapeXml(article.image.altText || article.title),
            caption: escapeXml(article.title)
          });
        }
      }
      
      // Images dans le contenu de l'article
      if (article.content) {
        const imgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = imgRegex.exec(article.content)) !== null) {
          const imageUrl = extractImageFromUrl(match[1]);
          if (imageUrl && !images.find(img => img.loc === imageUrl)) {
            images.push({
              loc: imageUrl,
              title: escapeXml(article.title),
              caption: escapeXml(article.title)
            });
          }
        }
      }
      
      // Ajouter l'URL de l'article avec ses images
      if (images.length > 0) {
        xml += `  <url>
    <loc>${articleUrl}</loc>
`;
        
        images.forEach(image => {
          xml += `    <image:image>
      <image:loc>${image.loc}</image:loc>
      <image:title>${image.title}</image:title>
      <image:caption>${image.caption}</image:caption>
    </image:image>
`;
          totalImages++;
        });
        
        xml += `  </url>
`;
      }
    });
  });

  // Ajouter les images des métaobjets (jeux)
  if (metaobjects.length > 0) {
    xml += `  <url>
    <loc>https://gaming-hub.fr/blogs/calendrier-des-sorties-de-jeux-video</loc>
`;
    
    metaobjects.forEach(metaobject => {
      const fields = {};
      metaobject.fields.forEach(field => {
        fields[field.key] = field.value;
      });
      
      if (fields.image_url) {
        const imageUrl = extractImageFromUrl(fields.image_url);
        if (imageUrl) {
          xml += `    <image:image>
      <image:loc>${imageUrl}</image:loc>
      <image:title>${escapeXml(fields.titre || 'Jeu vidéo')}</image:title>
      <image:caption>${escapeXml(fields.titre || 'Nouveauté jeu vidéo')}</image:caption>
    </image:image>
`;
          totalImages++;
        }
      }
    });
    
    xml += `  </url>
`;
  }

  xml += `</urlset>`;
  
  console.log(`✅ ${totalImages} images ajoutées au sitemap`);
  return xml;
}

async function main() {
  try {
    const blogs = await fetchAllBlogs();
    console.log(`✅ ${blogs.length} blogs récupérés`);
    
    let totalArticles = 0;
    blogs.forEach(blog => {
      totalArticles += blog.articles.edges.length;
      console.log(`  - ${blog.title}: ${blog.articles.edges.length} articles`);
    });
    console.log(`✅ ${totalArticles} articles au total`);
    
    const metaobjects = await fetchMetaobjectImages();
    console.log(`✅ ${metaobjects.length} métaobjets jeux récupérés`);

    const xml = generateSitemap(blogs, metaobjects);
    fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
    console.log(`✅ Sitemap généré : ${OUTPUT_FILE}`);
    console.log(`📊 Taille : ${(xml.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

main();
