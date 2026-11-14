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

REBUILD_REQUESTED=0
if [ "${1:-}" = "--rebuild" ]; then
    REBUILD_REQUESTED=1
fi

echo "=========================================="
echo "   Instalando Orca Teams en tu sistema    "
echo "=========================================="

NEEDS_BUILD=0
if [ "$REBUILD_REQUESTED" = "1" ] || [ ! -f "$SOURCE_APP_DIR/orca-ide" ] || [ ! -f "$SOURCE_APP_DIR/resources/app.asar" ]; then
    NEEDS_BUILD=1
elif [ "$SCRIPT_DIR/resources/build/icon.png" -nt "$SOURCE_APP_DIR/resources/app.asar" ] || \
     [ "$SCRIPT_DIR/resources/icon.png" -nt "$SOURCE_APP_DIR/resources/app.asar" ] || \
     [ "$SCRIPT_DIR/package.json" -nt "$SOURCE_APP_DIR/resources/app.asar" ] || \
     [ "$SCRIPT_DIR/src/main/index.ts" -nt "$SOURCE_APP_DIR/resources/app.asar" ]; then
    NEEDS_BUILD=1
fi

if [ "$NEEDS_BUILD" = "1" ]; then
    echo "🔨 Compilando última versión desempaquetada de Orca Teams..."
    (
      cd "$SCRIPT_DIR" &&
      pnpm run build:electron-vite &&
      pnpm run build:web-from-renderer &&
      pnpm run build:mobile-web &&
      npx electron-builder --config config/electron-builder.config.cjs --dir
    )
fi

echo "🛑 0. Deteniendo instancias previas de Orca Teams (si existen)..."
pkill -TERM -f "$TARGET_APP_DIR/orca-ide" 2>/dev/null || true
pkill -TERM -f "$HOME/.config/orca-teams/" 2>/dev/null || true
sleep 1

echo "📦 1. Copiando aplicación a $TARGET_APP_DIR..."
rm -rf "$TARGET_APP_DIR"
mkdir -p "$TARGET_APP_DIR"
cp -a "$SOURCE_APP_DIR"/. "$TARGET_APP_DIR"/
chmod +x "$TARGET_APP_DIR/orca-ide"

echo "🎨 2. Instalando iconos de Orca Teams..."
mkdir -p "$ICONS_DIR" "$PIXMAPS_DIR"
cp -f "$SCRIPT_DIR/resources/build/icon.png" "$TARGET_APP_DIR/orca-teams-icon.png"
cp -f "$SCRIPT_DIR/resources/build/icon.png" "$ICONS_DIR/orca-teams.png"
cp -f "$SCRIPT_DIR/resources/build/icon.png" "$PIXMAPS_DIR/orca-teams.png"
if [ ! -f "$HOME/.local/share/icons/hicolor/index.theme" ] && [ -f "/usr/share/icons/hicolor/index.theme" ]; then
    cp -f "/usr/share/icons/hicolor/index.theme" "$HOME/.local/share/icons/hicolor/index.theme"
fi
if command -v python3 >/dev/null 2>&1 && python3 -c "import PIL" 2>/dev/null; then
    python3 - "$SCRIPT_DIR/resources/build/icon.png" << 'PYEOF'
import os, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
home = os.path.expanduser('~')
for s in [16, 24, 32, 48, 64, 128, 256, 512]:
    s_dir = os.path.join(home, f'.local/share/icons/hicolor/{s}x{s}/apps')
    os.makedirs(s_dir, exist_ok=True)
    im.resize((s, s), Image.Resampling.LANCZOS).save(os.path.join(s_dir, 'orca-teams.png'))
PYEOF
else
    for s in 16 24 32 48 64 128 256; do
        s_dir="$HOME/.local/share/icons/hicolor/${s}x${s}/apps"
        mkdir -p "$s_dir"
        cp -f "$SCRIPT_DIR/resources/icon.png" "$s_dir/orca-teams.png" 2>/dev/null || true
    done
fi

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

exec "$HOME/.local/share/orca-teams/orca-ide" --class=orca-teams "$@"
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
Icon=__ICON_PATH__
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=orca-teams
MimeType=text/markdown;text/csv;text/tab-separated-values;
Keywords=orca;teams;ide;code;agent;
EOF

sed -i "s|__EXEC_PATH__|$BIN_DIR/orca-teams|g" "$DESKTOP_DIR/orca-teams.desktop"
sed -i "s|__ICON_PATH__|$TARGET_APP_DIR/orca-teams-icon.png|g" "$DESKTOP_DIR/orca-teams.desktop"
chmod +x "$DESKTOP_DIR/orca-teams.desktop"

# Actualizar base de datos de escritorio e iconos (GTK y KDE Plasma)
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

rm -f "$HOME/.cache/icon-cache.kcache" 2>/dev/null || true
if command -v kbuildsycoca6 >/dev/null 2>&1; then
    kbuildsycoca6 --noincremental >/dev/null 2>&1 || true
elif command -v kbuildsycoca5 >/dev/null 2>&1; then
    kbuildsycoca5 --noincremental >/dev/null 2>&1 || true
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
