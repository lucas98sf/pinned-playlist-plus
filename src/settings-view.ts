import { target } from "./actions";
import { errorMessage } from "./errors";
import type { SpicetifyHost, Settings, ToggleKey } from "./types";

export function createSettingsView(
  S: SpicetifyHost,
  doc: Document,
  getSettings: () => Settings,
  configure: (next: unknown) => void,
) {
  const api = S.Platform;
  let settingsMount: HTMLElement | null = null;
  function unmountSettings() {
    if (settingsMount) S.ReactDOM?.unmountComponentAtNode?.(settingsMount);
    settingsMount = null;
  }
  function showSettings() {
    unmountSettings();
    const root = doc.createElement("div");
    root.className = "ppp-settings";
    const help = doc.createElement("p");
    help.textContent =
      "Uses the first pinned playlist in Your Library. Reorder your pins to change the destination.";
    root.append(help);
    const controls = {} as Record<ToggleKey, HTMLInputElement>;
    function toggle(key: ToggleKey, text: string) {
      const row = doc.createElement("label");
      row.className = "ppp-toggle";
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.checked = getSettings()[key];
      row.append(input, doc.createTextNode(text));
      root.append(row);
      controls[key] = input;
    }
    toggle("enabled", "Enable Pinned Playlist Plus");
    const modeLabel = doc.createElement("label");
    modeLabel.textContent = "What should + do?";
    const mode = doc.createElement("select");
    for (const [value, text] of [
      ["playlist", "Add to first pinned playlist"],
      ["both", "Add to first pinned playlist AND Liked Songs"],
      ["liked", "Toggle Liked Songs only"],
    ]) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = text;
      mode.append(option);
    }
    mode.value = getSettings().mode;
    modeLabel.append(mode);
    root.append(modeLabel);
    toggle("separateHeart", "Show a separate Liked Songs button alongside +");
    toggle("heartIcon", "Use a heart icon for Liked Songs");
    const status = doc.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "First pinned playlist: checking…";
    root.append(status);
    target(api)
      .then((result) => {
        status.textContent = `First pinned playlist: ${result.name || "Unnamed playlist"}`;
      })
      .catch((error) => {
        status.textContent = errorMessage(error);
      });
    const saveSettings = () => {
      try {
        configure({
          enabled: controls.enabled.checked,
          mode: mode.value,
          separateHeart: controls.separateHeart.checked,
          heartIcon: controls.heartIcon.checked,
        });
        S.PopupModal.hide();
        S.showNotification("Pinned Playlist Plus settings saved");
      } catch (error) {
        status.textContent = errorMessage(error);
      }
    };
    const actions = doc.createElement("div");
    actions.className = "ppp-settings-actions";
    root.append(actions);
    if (
      S.React?.createElement &&
      S.ReactDOM?.render &&
      S.ReactComponent?.ButtonPrimary
    ) {
      settingsMount = actions;
      S.ReactDOM.render(
        S.React.createElement(
          S.ReactComponent.ButtonPrimary,
          {
            buttonSize: "md",
            colorSet: "brightAccent",
            onClick: saveSettings,
          },
          "Save settings",
        ),
        actions,
      );
    } else {
      const save = doc.createElement("button");
      save.type = "button";
      save.className = "ppp-save";
      save.textContent = "Save settings";
      save.onclick = saveSettings;
      actions.append(save);
    }
    S.PopupModal.display({ title: "Pinned Playlist Plus", content: root });
  }

  return {
    show: showSettings,
    dispose: unmountSettings,
    cleanDetached() {
      if (settingsMount && !settingsMount.isConnected) unmountSettings();
    },
  };
}
