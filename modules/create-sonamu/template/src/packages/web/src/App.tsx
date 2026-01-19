import { type ReactNode, Suspense } from "react";

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
      </div>
    </div>
  );
}

export default App;
