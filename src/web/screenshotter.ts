if (import.meta.env.DEV) {
  void import("@zohaibarsalan/screenshotter").then(
    ({ defineScreenshotterConfig, mountScreenshotter }) => {
      mountScreenshotter(
        defineScreenshotterConfig({
          enabled: true,
          project: "pulseboard",
          captureSettleMs: 500,
          defaultMode: "viewport",
          themeSelectionDefault: "current",
          themeAdapter: {
            getCurrentTheme: () =>
              document.documentElement.classList.contains("dark") ? "dark" : "light",
            setTheme: (theme) => {
              document.documentElement.classList.toggle("dark", theme === "dark");
              localStorage.setItem("pb-theme", theme);
            },
          },
          onError: (message) => {
            console.error(`[Screenshotter] ${message}`);
          },
        }),
      );
    },
  );
}
