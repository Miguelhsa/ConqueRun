# Inicio diario de desarrollo — ConqueRun

## Una sola vez

Añadir el LANG al perfil para no escribirlo cada día:

```bash
echo 'export LANG=en_US.UTF-8' >> ~/.zshrc
source ~/.zshrc
```

---

## Cada día

### Arranque completo (primera vez del día)

```bash
cd /Users/miguel/conqueRun
npm run ios
```

Arranca Metro, compila el build nativo y abre el simulador.
La primera vez tarda ~1-2 minutos. Las siguientes son instantáneas.

### Arranque rápido (si el simulador ya está abierto)

```bash
cd /Users/miguel/conqueRun
npx expo start --ios
```

Solo arranca Metro sin recompilar. Para cuando únicamente tocas JS.

---

## Atajos en el simulador

| Acción | Atajo |
|---|---|
| Recargar la app | ⌘R |
| Abrir menú de desarrollo | ⌘D |

---

## Limpiar caché (cuando algo va raro)

```bash
cd /Users/miguel/conqueRun
npx expo start --clear
```
