import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <p className="text-gray-600">Welcome to the admin panel. Start building your application.</p>

      {/* TODO: 대시보드 위젯 추가 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        <div className="p-6 bg-gray-50 rounded-lg border">
          <h3 className="font-semibold mb-2">Quick Start</h3>
          <p className="text-sm text-gray-600">
            Add entities with <code className="bg-gray-200 px-1 rounded">sonamu entity add</code>
          </p>
        </div>
      </div>
    </div>
  );
}
