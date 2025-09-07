# TrainAR Vue.js Frontend

Сучасний Vue.js 3.5 фронтенд для TrainAR системи детекції об'єктів з інтеграцією WebSocket та WebRTC.

## 🚀 Особливості

- **Vue 3.5** з Composition API та `<script setup>`
- **Vite** як швидкий збірник замість Rollup
- **Pinia** для управління станом
- **TypeScript** з повною типізацією
- **WebSocket** інтеграція для реального часу
- **WebRTC** для голосового агента OpenAI
- **Reactive UI** з smooth animations
- **Responsive Design** для мобільних пристроїв

## 📁 Структура проекту

```
frontend/
├── src/
│   ├── components/          # Vue компоненти
│   │   ├── VideoCanvas.vue  # Відео потік та детекція
│   │   ├── ControlPanel.vue # Панель керування
│   │   ├── DetectionsList.vue
│   │   ├── PromptManager.vue
│   │   ├── ChatMessagesPanel.vue
│   │   ├── SceneAnalysisPanel.vue
│   │   └── PerformancePanel.vue
│   ├── composables/         # Vue composables
│   │   ├── useWebSocket.ts  # WebSocket логіка
│   │   ├── useCamera.ts     # Камера та відео
│   │   └── useDetection.ts  # Детекція об'єктів
│   ├── stores/             # Pinia stores
│   │   ├── app.ts          # Загальний стан
│   │   ├── detection.ts    # Детекція об'єктів
│   │   ├── prompts.ts      # Управління промптами
│   │   └── voiceAgent.ts   # WebRTC голосовий агент
│   ├── types/              # TypeScript типи
│   │   └── index.ts
│   ├── services/           # API сервіси
│   ├── App.vue             # Головний компонент
│   ├── main.ts             # Точка входу
│   └── style.css           # Глобальні стилі
├── index.html
├── vite.config.ts          # Vite конфігурація
├── tsconfig.json           # TypeScript конфігурація
└── package.json
```

## 🛠 Встановлення та запуск

### Встановлення залежностей:
```bash
cd frontend
npm install
```

### Запуск для розробки:
```bash
npm run dev
```
Сервер буде доступний на http://localhost:3000

### Збірка для продакшену:
```bash
npm run build
```
Результат збірки буде в папці `../static/frontend/`

### Перевірка типів:
```bash
npm run type-check
```

## 🔧 Конфігурація

### Vite Proxy
Налаштовано проксі до FastAPI backend:
- `/ws` → `ws://localhost:8000` (WebSocket)
- `/api` → `http://localhost:8000` (REST API)
- `/realtime` → `http://localhost:8000` (OpenAI Realtime)

### Environment Variables
Можете налаштувати змінні оточення у `.env` файлі:
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

## 📋 Основні компоненти

### VideoCanvas.vue
- Відображення відео з камери
- Рендер bounding boxes для детекцій
- Smooth tracking з IoU matching

### ControlPanel.vue
- Керування параметрами детекції (confidence, IoU, image size)
- Управління FPS
- Фільтрація об'єктів
- Налаштування промптів

### Pinia Stores

#### `useDetectionStore`
- Поточні детекції об'єктів
- Smooth tracking та фільтрація
- Параметри детекції

#### `useVoiceAgentStore`
- WebRTC з'єднання з OpenAI
- Scene analysis descriptions
- Реальний час голосового агента

#### `usePromptsStore`
- CRUD операції з промптами
- Вибір активного промпту

## 🔌 API Інтеграція

### WebSocket (/ws/detect)
```typescript
// Відправка кадру для детекції
{
  type: 'frame',
  timestamp: number,
  frame: string, // base64
  params: { conf: number, iou: number, imgsz: number }
}

// Отримання результатів
{
  type: 'detection',
  detections: Detection[],
  fps: number,
  latency_ms: number
}
```

### REST API
- `GET /api/prompts` - список промптів
- `POST /api/prompts` - створення промпту
- `PUT /api/prompts/:id` - редагування
- `DELETE /api/prompts/:id` - видалення

## 🎯 Використання

1. **Запустіть FastAPI сервер** на порту 8000
2. **Запустіть Vue frontend** на порту 3000  
3. **Відкрийте http://localhost:3000** у браузері
4. **Натисніть "Start Call"** для початку детекції
5. **Налаштуйте параметри** за потребою
6. **Оберіть промпт** для голосового асистента

## 🔄 Міграція з vanilla JS

Основні переваги після міграції:
- ✅ Реактивність та декларативність
- ✅ Краща організація коду
- ✅ TypeScript автокомпліт
- ✅ Hot Module Replacement
- ✅ Менший bundle size
- ✅ Легше тестування та підтримка

## 🐛 Troubleshooting

### WebSocket не підключається
- Переконайтеся, що FastAPI сервер запущений на порту 8000
- Перевірте налаштування проксі у `vite.config.ts`

### Камера не працює
- Дайте дозволи браузеру на використання камери
- Перевірте HTTPS для production

### Build помилки
- Запустіть `npm run type-check` для перевірки TypeScript
- Перевірте версії залежностей у `package.json`

## 📝 TODO для подальшого розвитку

- [ ] Unit тести з Vitest
- [ ] E2E тести з Cypress
- [ ] PWA підтримка
- [ ] Інтернаціоналізація (i18n)  
- [ ] Dark mode toggle
- [ ] Performance optimization
- [ ] Error boundaries