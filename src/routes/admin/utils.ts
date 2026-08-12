export type HTMLPageParams = {
  innerHTML: string;
  head: {
    css: string;
    title: string;
  };
};

export const buildHTMLPage = (params: HTMLPageParams) => {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${params.head.title}</title>
    <style>
      ${params.head.css}
    </style>
  </head>
  <body>
    ${params.innerHTML}
  </body>
</html>`;
};
