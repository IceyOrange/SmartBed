export type AppTab = "home" | "contact" | "profile";

export function shouldShowContactLauncher(tab: AppTab): boolean {
  return tab === "home" || tab === "contact";
}
