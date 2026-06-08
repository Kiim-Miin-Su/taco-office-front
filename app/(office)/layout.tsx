import AsideClient from "@/app/AsideClient";

export default function OfficeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh">
      <AsideClient />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
