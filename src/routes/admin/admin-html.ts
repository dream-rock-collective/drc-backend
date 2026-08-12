import { buildHTMLPage } from "./utils";

export const adminPage = () => {
  return buildHTMLPage({
    head: {
      title: "Admin | DreamRock Collective",
      css: `
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f5f5f5; color: #222; }
      main { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
      h1 { margin-top: 0; }
      .card { overflow-x: auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; text-align: left; }
      th, td { padding: .8rem 1rem; border-bottom: 1px solid #eee; white-space: nowrap; }
      th { background: #fafafa; font-size: .85rem; }
      tr:last-child td { border-bottom: 0; }
      .muted { color: #666; }
      .error { padding: 1rem; color: #8a1c1c; background: #fff0f0; border: 1px solid #e0a0a0; border-radius: 8px; }
      `,
    },
    innerHTML: ``,
  });
};
