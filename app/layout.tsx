export const metadata = {
  title: "Gmail Second Account — MCP Connector",
  description: "Private remote MCP server exposing a second Gmail account.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
