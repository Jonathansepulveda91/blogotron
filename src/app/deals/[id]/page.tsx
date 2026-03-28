import fs from 'fs';
import path from 'path';

export default function DealPage({ params }: { params: { id: string } }) {
  const dataFilePath = path.join(process.cwd(), 'src', 'data', 'deals.json');
  let deal = null;
  
  try {
    const fileContents = fs.readFileSync(dataFilePath, 'utf8');
    const deals = JSON.parse(fileContents);
    deal = deals.find((d: any) => d.deal_id === params.id);
  } catch (error) {
    console.error("Could not load deals:", error);
  }

  if (!deal) {
    return (
      <div className="container" style={{ padding: '100px 0', textAlign: 'center' }}>
        <h2>Deal Not Found</h2>
        <p>This deal might have expired or been removed.</p>
        <br/>
        <a href="/" className="btn-primary">View Active Deals</a>
      </div>
    );
  }

  // Use local image or fallback
  const imgUrl = deal.local_image ? `/images/${deal.local_image}` : deal.image_url;

  return (
    <article className="container" style={{ maxWidth: '800px', margin: '40px auto' }}>
      <header style={{ marginBottom: '30px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', backgroundColor: '#E31837', color: 'white', padding: '4px 12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '15px', borderRadius: '4px' }}>
          Hot Deal
        </div>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>{deal.title}</h1>
        <div style={{ color: '#aaa', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '20px' }}>
          <span>Posted: {new Date(deal.posted_at).toLocaleDateString()}</span>
          <span>Heat: 🔥 {deal.heat_score}</span>
        </div>
      </header>

      {imgUrl && (
        <div style={{ width: '100%', height: '400px', backgroundColor: '#fff', backgroundImage: `url('${imgUrl}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', borderRadius: '8px', marginBottom: '40px', border: '1px solid #333' }}></div>
      )}

      <div className="deal-content" style={{ fontSize: '1.15rem', lineHeight: '1.8' }} dangerouslySetInnerHTML={{ __html: deal.content }} />

      <div style={{ marginTop: '50px', padding: '30px', backgroundColor: '#161616', border: '2px solid #333', borderRadius: '8px', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '15px', fontSize: '1.5rem' }}>Current Amazon Price: <span style={{ color: '#E31837', fontSize: '2rem' }}>{deal.price}</span></h3>
        <p style={{ color: '#888', marginBottom: '20px' }}>Prices and availability are accurate as of the time of posting and are subject to change.</p>
        
        <a href={deal.link} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ padding: '18px 40px', fontSize: '1.3rem', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
          VIEW DEAL ON AMAZON
        </a>
      </div>
    </article>
  );
}
