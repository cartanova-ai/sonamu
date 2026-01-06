export const FileTree = ({ children }) => {
  return <div className="file-tree" style={{ margin: '20px', marginLeft: '-30px' }}>{children}</div>;
};

export const FileItem = ({ name, description, children }) => {
  const isLeaf = !children;
  
  const getFileExtension = (filename) => {
    if (filename.endsWith('/')) return null;
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : null;
  };

  const getExtensionStyle = (ext) => {
    const styles = {
      TS: { backgroundColor: '#3178c6', color: 'white' },
      TSX: { backgroundColor: '#3178c6', color: 'white' },
      JS: { backgroundColor: '#f7df1e', color: 'black' },
      JSX: { backgroundColor: '#f7df1e', color: 'black' },
      JSON: { backgroundColor: '#ffd700', color: 'black' },
      YML: { backgroundColor: '#cb171e', color: 'white' },
      YAML: { backgroundColor: '#cb171e', color: 'white' },
      SQL: { backgroundColor: '#e38c00', color: 'white' },
      SH: { backgroundColor: '#4eaa25', color: 'white' },
      MD: { backgroundColor: '#083fa1', color: 'white' },
      CSS: { backgroundColor: '#563d7c', color: 'white' },
      HTML: { backgroundColor: '#e34c26', color: 'white' },
      ENV: { backgroundColor: '#6c757d', color: 'white' },
    };
    
    return styles[ext] || { backgroundColor: '#6c757d', color: 'white' };
  };

  const ext = getFileExtension(name);
  const extStyle = ext ? getExtensionStyle(ext) : null;

  return (
    <div style={{ marginLeft: '30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span className="file-icon">{(isLeaf && !name.endsWith("/")) ? "📄" : "📁"}</span>
          {ext && (
            <span 
              style={{
                position: 'absolute',
                bottom: '2px',
                right: '0px',
                fontSize: '5px',
                fontWeight: 'bold',
                padding: '1px',
                borderRadius: '2px',
                lineHeight: '1',
                minWidth: '8px',
                textAlign: 'center',
                ...extStyle
              }}
            >
              {ext}
            </span>
          )}
        </span>
        <code>{name}</code>
        {description && <span className="description"> - {description}</span>}
      </div>
      {children}
    </div>
  );
};
