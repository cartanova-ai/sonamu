import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// 라우터 생성 (파일 기반 라우팅 사용)
const router = createRouter({ routeTree });

function App() {
  return <RouterProvider router={router} />;
}

export default App;
