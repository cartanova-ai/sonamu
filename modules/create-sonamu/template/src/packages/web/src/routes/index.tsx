import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Welcome to Sonamu</h1>
      <p className="text-gray-600">Start building your application.</p>

      {/* TODO: 사용자용 콘텐츠 추가 */}
      <div className="mt-8">
        <p className="text-sm text-gray-500">
          This is the user-facing home page. Customize it as needed.
        </p>
      </div>
    </div>
  );
}
