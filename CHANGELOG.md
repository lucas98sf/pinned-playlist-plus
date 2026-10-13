# Changelog

## 1.2.4

- Remove bold styling from the settings symbols.

## 1.2.3

- Use a dedicated symbol font so ⊕ and ♥ remain legible in Spotify.
- Explain both playlist destinations in the settings introduction.

## 1.2.2

- Use ⊕ in settings labels, with matching bold styling and spacing for ⊕ and ♥.

## 1.2.1

- Give settings dropdowns an inset chevron, native-style sizing and focus states.
- Add spacing around the ♥ in settings and clarify the playlist-only option.

## 1.2.0

- Rename the extension to Save to Playlist while preserving installation and updater compatibility.
- Add a destination selector for the first pinned playlist or most recently updated editable playlist, including unpinned playlists and folder contents.
- Use Spotify’s Recently Updated order with pin grouping disabled, including empty playlists after removing their last song. Listening activity does not change the destination.
- Update settings, tooltips, Marketplace description, preview, and documentation for both destinations. Existing settings keep first-pinned behavior.
- Clear playlist check states when switching destinations and refresh the recent destination after edits to other playlists.

## 1.1.5

- Remove the redundant Liked Songs-only mode; disable the extension for Spotify's default behavior.
- Migrate existing Liked Songs-only settings to the extension being disabled.

## 1.1.4

- Combine the separate Liked Songs button and icon options into one ♥ button toggle.
- Preserve the existing preference for showing the separate button; Liked Songs always uses ♥.

## 1.1.3

- Bold only the playlist name in settings.
- Document how to update older Marketplace installations and when clearing cache helps.

## 1.1.2

- Fresh Marketplace installations use the tagged release instead of a cached main-branch bundle.
- Synchronize the publication tag automatically when bumping the version.

## 1.1.1

- Update playlist checks immediately after confirmed removal and readdition.
- Prevent delayed Spotify membership reads from undoing a recent successful action.
- Use a subtle text button for updates in settings.

## 1.1.0

- Check for updates, install a stable release and reload from settings.
- Marketplace updates use tagged download URLs and preserve account settings.
- Validate the release download before changing the installed version.
- Publish versioned releases with a Windows installer and SHA-256 checksum.

## 1.0.1

- Remove songs using Spotify's playlist row ID.
- Show the running version in settings.

## 1.0.0

- Save songs to the first pinned playlist with + and toggle Liked Songs with ♥.
