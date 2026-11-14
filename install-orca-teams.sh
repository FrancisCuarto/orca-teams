#!/usr/bin/env bash
set -e

# ==============================================================================
# Script de instalación para Orca Teams (Aplicación de Escritorio Independiente)
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_APP_DIR="$SCRIPT_DIR/dist/linux-unpacked"
TARGET_APP_DIR="$HOME/.local/share/orca-teams"
DESKTOP_DIR="$HOME/.local/share/applications"
ICONS_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
PIXMAPS_DIR="$HOME/.local/share/pixmaps"
BIN_DIR="$HOME/.local/bin"

echo "=========================================="
echo "   Instalando Orca Teams en tu sistema    "
echo "=========================================="

if [ ! -f "$SOURCE_APP_DIR/orca-ide" ]; then
    echo "⚠️  No se encontró el ejecutable en $SOURCE_APP_DIR."
    echo "Compilando versión desempaquetada primero..."
    (
      cd "$SCRIPT_DIR" &&
      pnpm run build:electron-vite &&
      pnpm run build:web-from-renderer &&
      npx electron-builder --config config/electron-builder.config.cjs --dir
    )
fi

echo "📦 1. Copiando aplicación a $TARGET_APP_DIR..."
rm -rf "$TARGET_APP_DIR"
mkdir -p "$TARGET_APP_DIR"
cp -a "$SOURCE_APP_DIR"/. "$TARGET_APP_DIR"/
chmod +x "$TARGET_APP_DIR/orca-ide"

echo "🎨 2. Instalando iconos de Orca Teams..."
mkdir -p "$ICONS_DIR" "$PIXMAPS_DIR"
cp "$SCRIPT_DIR/resources/build/icon.png" "$ICONS_DIR/orca-teams.png"
cp "$SCRIPT_DIR/resources/build/icon.png" "$PIXMAPS_DIR/orca-teams.png"

echo "🔗 3. Creando lanzador en línea de comandos ($BIN_DIR/orca-teams)..."
mkdir -p "$BIN_DIR"
# Remove any prior symlink before writing so redirection never overwrites the target ELF binary
rm -f "$BIN_DIR/orca-teams"
cat << 'EOF' > "$BIN_DIR/orca-teams"
#!/usr/bin/env bash
# Clear parent Orca environment variables so Orca Teams runs completely independently
_bg_launch="${ORCA_BACKGROUND_LAUNCH:-}"
_teams_user_data="${ORCA_TEAMS_USER_DATA_PATH:-}"
for _var in $(compgen -v ORCA_); do
  unset "$_var"
done
unset CLAUDE_CODE_PLUGIN_DIRS
unset JCODE_RUNTIME_DIR
unset TERM_PROGRAM
[ -n "$_bg_launch" ] && export ORCA_BACKGROUND_LAUNCH="$_bg_launch"
[ -n "$_teams_user_data" ] && export ORCA_TEAMS_USER_DATA_PATH="$_teams_user_data"
export CHROME_DESKTOP="orca-teams.desktop"

exec "$HOME/.local/share/orca-teams/orca-ide" "$@"
EOF
chmod +x "$BIN_DIR/orca-teams"

echo "🖥️  4. Creando lanzador de escritorio (menú de aplicaciones)..."
mkdir -p "$DESKTOP_DIR"
cat << 'EOF' > "$DESKTOP_DIR/orca-teams.desktop"
[Desktop Entry]
Name=Orca Teams
Comment=Next-gen IDE for parallel agentic development and team collaboration
GenericName=Integrated Development Environment
Exec=__EXEC_PATH__ %U
Icon=orca-teams
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=orca-teams
MimeType=text/markdown;text/csv;text/tab-separated-values;
Keywords=orca;teams;ide;code;agent;
EOF

sed -i "s|__EXEC_PATH__|$BIN_DIR/orca-teams|g" "$DESKTOP_DIR/orca-teams.desktop"
chmod +x "$DESKTOP_DIR/orca-teams.desktop"

# Actualizar base de datos de escritorio si existe el comando
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

echo ""
echo "=========================================="
echo "  ✅ ¡Orca Teams se instaló con éxito!     "
echo "=========================================="
echo "Ahora puedes:"
echo " 1. Buscar 'Orca Teams' en el menú de aplicaciones de tu escritorio (tecla Super/Windows)."
echo " 2. Anclarla a tu barra de favoritos / dock como cualquier otra app."
echo " 3. Ejecutarla desde cualquier terminal escribiendo simplemente: orca-teams"
echo ""
