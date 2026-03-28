import fs from 'fs';
import path from 'path';

export default function Home() {
  const dataFilePath = path.join(process.cwd(), 'src', 'data', 'deals.json');
  let deals: any[] = [];
  
  try {
    const fileContents = fs.readFileSync(dataFilePath, 'utf8');
    deals = JSON.parse(fileContents);
    // Sort deals newest first
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
            <p style={{ textAlign: 'center', gridColumn: '1 / -1', color: '#888' }}>Loading new deals...</p>
          ) : (
            deals.map((deal) => (
              <article className="card" key={deal.deal_id}>
                {deal.image_url ? (
                  <div className="card-img" style={{
                    height: '250px',
                    backgroundImage: `url('${deal.image_url}')`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    backgroundColor: '#fff',
                    borderBottom: '1px solid #222',
                    position: 'relative'
                  }}>
                    {deal.heat_score > 80 && (
                      <div className="heat-badge">
                        🔥 {deal.heat_score} Heat
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="card-img-placeholder">
                    {deal.heat_score > 80 && (
                      <div className="heat-badge">
                        🔥 {deal.heat_score} Heat
                      </div>
                    )}
                    <span>IMAGE UNAVAILABLE</span>
                  </div>
                )}
                
                <div className="card-content">
                  <div className="deal-meta">
                    <span className="price">{deal.price}</span>
                    <span className="retailer">AMAZON</span>
                  </div>
                  
                  <h2 className="card-title">{deal.title}</h2>
                  
                  <div 
                    className="card-excerpt"
                    dangerouslySetInnerHTML={{ __html: deal.content.substring(0, 1000) }}
                  />
                  
                  <a href={deal.link} target="_blank" rel="noopener noreferrer" className="btn-primary">
                    View on Amazon
                  </a>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
