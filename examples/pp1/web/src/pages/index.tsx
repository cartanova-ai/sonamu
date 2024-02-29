import React from "react";
import BrandsList from "../BrandsList";

type PublicIndexPageProps = {};
export default function PublicIndexPage(props: PublicIndexPageProps) {
  return (
    <div className="intro">
      <h1>🌲</h1>
      <h2>Hello, Sonamu!</h2>
      <div style={{ marginTop: "3em", color: "#666" }}>
        <strong>Sonamu</strong> is the full-stack framework for startup
        developers,
        <br />
        based on <strong>Node.js/TypeScript</strong>.
      </div>
      <br />
      <BrandsList />
    </div>
  );
}
