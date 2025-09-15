import "./globals.css"; // important, must be here

export const metadata = {
    title: "Stock Dashboard",
    description: "Track your favorite stocks and news",
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" data-theme="light" style={{ colorScheme: "light" }}>
            <body className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-700 to-sky-500 text-white flex flex-col">
                {children}
            </body>
        </html>
    );
}

