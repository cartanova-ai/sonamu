import { QueryClientProvider } from "@tanstack/react-query";
import type React from "react";

export default function Main({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  // biome-ignore lint/suspicious/noExplicitAny: QueryClient 타입을 any로 받아야 함
  queryClient: any;
}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
