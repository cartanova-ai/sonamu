import { SonamuProvider } from "@sonamu-kit/react-components";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type React from "react";
import App from "@/App";
import { AuthProvider } from "@/admin-common/auth";
import { FileService } from "@/services/services.generated";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Miomock: Sonamu shines evergreen" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <QueryClientProvider client={queryClient}>
            <SonamuProviderWithUploader>
              <AuthProvider>
                <App>
                  <Outlet />
                </App>
              </AuthProvider>
            </SonamuProviderWithUploader>
          </QueryClientProvider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function SonamuProviderWithUploader({ children }: { children: React.ReactNode }) {
  const uploadSingleMutation = FileService.useUploadMutation();
  const uploadMultipleMutation = FileService.useUploadMultipleMutation();

  const uploader = async (files: File[]): Promise<string[]> => {
    if (files.length === 0) {
      return [];
    }

    // single 파일 업로드
    if (files.length === 1) {
      const result = await uploadSingleMutation.mutateAsync({ file: files[0] });
      return [result.file.url];
    }

    // multiple 파일 업로드
    const result = await uploadMultipleMutation.mutateAsync({ files });
    return result.files.map((file) => file.url);
  };

  return <SonamuProvider uploader={uploader}>{children}</SonamuProvider>;
}
