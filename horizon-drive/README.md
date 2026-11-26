# HORIZON DRIVE

Браузерная 3D-гонка (Three.js / WebGL2) в одном HTML-файле: `dist/HorizonDrive.html` (все модели, PBR-текстуры, HDRI и декодер Draco встроены, интернет не нужен).

## Сборка
```bash
npm install
npm run assets   # скачать ассеты (Poly Haven CC0 + модель из примеров three.js)
npm run build    # -> dist/HorizonDrive.html
```

## Управление (ПК)
W/↑ газ · S/↓ тормоз/задний ход · A/D руль · Пробел ручник · Shift/E, Ctrl/Q передачи (механика) · C камера · R вернуть на трассу · Esc пауза. Поддерживается геймпад.

## Ассеты и лицензии
- PBR-материалы и HDRI студии: Poly Haven (CC0).
- Модель автомобиля: «Ferrari 458 Italia» из примеров three.js (автор vicent091036, CC-BY 4.0) — используется как базовое шасси для всех 18 машин с процедурными обвесами, дисками и пропорциями.
- Карта нормалей воды: примеры three.js (MIT).
