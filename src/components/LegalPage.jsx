const pageScope = { 'data-v-0b677aea': '' }

function LegalPage({ title, intro, updated, sections }) {
  return (
    <div className="provably-fair" {...pageScope}>
      <div className="fair-content" {...pageScope}>
        <div className="fair-header" {...pageScope}>
          <div className="title-part" {...pageScope}>
            <h1 {...pageScope}>{title}</h1>
            <p className="title-bottom" {...pageScope}>{intro}</p>
          </div>
        </div>
        {sections.map((section, index) => (
          <div className="fair-verification" {...pageScope} key={`${section.heading}-${index}`}>
            <h2 {...pageScope}>{section.heading}</h2>
            {(section.body || []).map((paragraph) => <p {...pageScope} key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <div className="fair-breakdown" {...pageScope}>
                <ul {...pageScope}>
                  {section.bullets.map((item) => <li {...pageScope} key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
        <div className="fair-verification" {...pageScope}>
          <p className="note" {...pageScope}><strong {...pageScope}>Last updated:</strong> {updated}</p>
        </div>
      </div>
    </div>
  )
}

export default LegalPage
