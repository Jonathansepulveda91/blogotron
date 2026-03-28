import fs from 'fs';
import path from 'path';

export default function Home() {
  const dataFilePath = path.join(process.cwd(), 'src', 'data', 'deals.json');
  let deals: any[] = [];
  
  try {
    const fileContents = fs.readFileSync(dataFilePath, 'utf8');
    deals = JSON.parse(fileContents);
    deals.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
  } catch (error) {
    console.error("Could not load deals:", error);
  }

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Hardware Deals Done Right</h1>
          <p>We filter through the noise to find the absolute best community-verified Amazon deals on tech, PC parts, and gaming gear. Fast, verified, and strictly zero fluff.</p>
        </div>
      </section>

      <section className="container">
        <div className="grid">
          {deals.length === 0 ? (
            <p style={{ textAlign: 'center', gridColumn: '1 / -1', color: '#888' }}>No active deals right now. Check back soon.</p>
          ) : (
            deals.map((deal) => {
              const imgSrc = deal.local_image ? `/images/${deal.local_image}` : null;
              return (
                <article className="card" key={deal.deal_id}>
                  <a href={`/deals/${deal.deal_id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    {imgSrc ? (
                      <div style={{
                        height: '220px',
                        backgroundColor: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderBottom: '1px solid #222',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        <img src={imgSrc} alt={deal.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        {deal.heat_score > 80 && (
                          <div className="heat-badge">🔥 {deal.heat_score} Heat</div>
                        )}
                      </div>
                    ) : (
                      <div className="card-img-placeholder" style={{ position: 'relative' }}>
                        {deal.heat_score > 80 && (
                          <div className="heat-badge">🔥 {deal.heat_score} Heat</div>
                        )}
                        <span>📦</span>
                      </div>
                    )}
                  </a>
                  
                  <div className="card-content">
                    <div className="deal-meta">
                      <span className="price">{deal.price}</span>
                      <span className="retailer" style={{ backgroundColor: '#E31837', color: '#fff' }}>AMAZON</span>
                    </div>
                    
                    <h2 className="card-title">
                      <a href={`/deals/${deal.deal_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{deal.title}</a>
                    </h2>
                    
                    <a href={`/deals/${deal.deal_id}`} className="btn-primary" style={{ marginTop: 'auto' }}>
                      Read Full Article →
                    </a>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
