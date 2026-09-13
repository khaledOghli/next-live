/** Demo source strings for /docs/docusaurus. Server-safe (no defineLoader). */

export const docusaurusButtonDemo = `import { Button } from '@next-live-docusaurus/modules';

export default function Demo() {
  return <Button>Hello from Docusaurus</Button>;
}
`;

export const docusaurusCounterDemo = `import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      {n}
    </button>
  );
}
`;

export const docusaurusCounterFenceDemo = `import { useState } from 'react';

export default function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN((v) => v + 1)}>{n}</button>;
}
`;

export const docusaurusStaticFenceDemo = `export default function Static() {
  return <p>Not live</p>;
}
`;
