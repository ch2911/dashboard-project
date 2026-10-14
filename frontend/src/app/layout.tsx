import "./globals.css"; // important, must be here
import ThemeWatcher from "../../components/ThemeWatcher";
import { THEME_INIT_SCRIPT } from "../../utils/theme";

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
        // The script in <head> sets the saved theme on <html> before the page draws, so React
        // finds different attributes than the server rendered; that's expected here.
        <html lang="en" data-theme="light" data-accent="ocean" style={{ colorScheme: "light" }} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
            </head>
            <body className="min-h-screen app-bg text-white flex flex-col">
                <ThemeWatcher />
                {children}
            </body>
        </html>
    );
}
