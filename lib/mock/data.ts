/**
 * Demonstration dataset. All brands, people and figures are fictional.
 * Dates are generated relative to `now` so the demo always looks current.
 */
import type { DocumentItem, DocumentTemplate, Project, Thread } from "@/lib/types";

export interface MockDataset {
  projects: Project[];
  threads: Thread[];
  documents: DocumentItem[];
  templates: DocumentTemplate[];
}

export function createMockDataset(now: Date = new Date()): MockDataset {
  const ago = (days: number, hours = 0, minutes = 0) =>
    new Date(now.getTime() - ((days * 24 + hours) * 60 + minutes) * 60_000).toISOString();

  const projects: Project[] = [
    {
      id: "p-little-feet",
      name: "Little Feet",
      industry: "Частный детский сад",
      status: "active",
      color: "teal",
      description:
        "Детский сад полного дня для детей 2–6 лет в Казани: билингвальная программа, собственный бассейн, группы до 12 детей.",
      audience:
        "Родители 28–40 лет со средним и высоким доходом, живут или работают в Приволжском районе. Выбирают сад заранее и сравнивают 3–4 варианта.",
      usp: "Английский с носителем каждый день и группы до 12 детей — без доплат за кружки.",
      toneOfVoice: "Тёплый, спокойный, экспертный. Без сюсюканья и давления.",
      goals: "Заполнить две новые группы к сентябрю, 40 заявок на экскурсию в месяц.",
      competitors: ["Сад «Умка»", "Kids Academy", "Монтессори-центр «Росток»"],
      channels: ["VK", "Telegram-канал", "Яндекс Карты", "2ГИС"],
      createdAt: ago(48),
      updatedAt: ago(0, 1, 12),
    },
    {
      id: "p-sea-bottom",
      name: "Си Батом",
      industry: "Ресторан морской кухни",
      status: "active",
      color: "blue",
      description:
        "Ресторан морепродуктов на 60 мест в Санкт-Петербурге: устричный бар, живой краб, сеты для компаний.",
      audience:
        "Горожане 27–45 лет: ужины на двоих и деловые встречи. Туристы, которые ищут, где поесть морепродукты в центре.",
      usp: "Морепродукты Баренцева моря с поставкой за 48 часов и открытой кухней.",
      toneOfVoice: "Уверенный, гастрономичный, с лёгкой иронией.",
      goals: "Поднять загрузку в будни до 70% и запустить бранчи по выходным.",
      competitors: ["Устричная «Мидия»", "Fish Point", "Рыбный рынок «Причал»"],
      channels: ["VK", "Telegram-канал", "Яндекс Еда", "Блогеры"],
      createdAt: ago(31),
      updatedAt: ago(1, 3),
    },
    {
      id: "p-forma",
      name: "Форма Studio",
      industry: "Студия функционального тренинга",
      status: "active",
      color: "coral",
      description: "Две студии мини-групп в Екатеринбурге: функциональный тренинг, мобильность, программы для офисных сотрудников.",
      audience: "Офисные специалисты 25–40 лет, которые хотят тренироваться 2–3 раза в неделю рядом с работой.",
      usp: "Тренировки по 45 минут в группах до 8 человек и персональная программа после первого визита.",
      toneOfVoice: "Энергичный, поддерживающий, без «фитнес-пафоса».",
      goals: "120 пробных тренировок в месяц, удержание абонементов 65%.",
      competitors: ["X-Fit Plaza", "Студия «Пульс»"],
      channels: ["VK", "Telegram-канал", "Таргет VK Реклама"],
      createdAt: ago(22),
      updatedAt: ago(2, 5),
    },
    {
      id: "p-my-brand",
      name: "Мой бренд",
      industry: "Личный бренд нутрициолога",
      status: "draft",
      color: "violet",
      description: "Консультации по питанию для занятых специалистов и онлайн-марафоны.",
      audience: "",
      usp: "",
      toneOfVoice: "Дружелюбный, на «ты».",
      goals: "",
      competitors: [],
      channels: ["Telegram-канал"],
      createdAt: ago(5),
      updatedAt: ago(3, 2),
    },
    {
      id: "p-warm-home",
      name: "Тёплый дом — фабрика домашнего текстиля и пледов из натуральной шерсти",
      industry: "Производство и e-commerce",
      status: "archived",
      color: "amber",
      description:
        "Семейная фабрика пледов и покрывал из шерсти мериноса. Продажи через маркетплейсы и собственный интернет-магазин, сезонный спрос с октября по февраль.",
      audience: "Женщины 30–55 лет, которые обустраивают дом и выбирают подарки к праздникам.",
      usp: "Шерсть мериноса, пошив в России и гарантия 3 года.",
      toneOfVoice: "Уютный, искренний, немного ностальгичный.",
      goals: "Сезон завершён. Проект в архиве до следующей кампании.",
      competitors: ["Ozon-бренды пледов", "Домашний текстиль «Лён и Ко»"],
      channels: ["Ozon", "Wildberries", "VK"],
      createdAt: ago(210),
      updatedAt: ago(64),
    },
  ];

  const threads: Thread[] = [
    {
      id: "t-lf-strategy",
      title: "Стратегия продвижения на осень",
      projectId: "p-little-feet",
      scenarioId: "strategy",
      createdAt: ago(0, 2, 40),
      updatedAt: ago(0, 1, 12),
      messages: [
        {
          id: "m-lf-1",
          role: "user",
          createdAt: ago(0, 2, 40),
          text: "Собери стратегию продвижения на 3 месяца. Цель — 40 заявок на экскурсию в месяц, бюджет на рекламу до 120 000 ₽ в месяц.",
        },
        {
          id: "m-lf-2",
          role: "assistant",
          createdAt: ago(0, 1, 12),
          text: "Подготовил стратегию на сентябрь–ноябрь. Основной упор — на доверие родителей и локальный поиск.",
          result: {
            kind: "strategy",
            title: "Стратегия продвижения Little Feet: сентябрь – ноябрь",
            summary:
              "Родители выбирают сад долго и по рекомендациям, поэтому стратегия строится на доказательствах качества: открытые экскурсии, отзывы и локальная видимость в картах.",
            status: "review",
            blocks: [
              {
                type: "metrics",
                items: [
                  { label: "Цель по заявкам", value: "40 / мес", hint: "сейчас ~18" },
                  { label: "Бюджет", value: "120 000 ₽", hint: "в месяц" },
                  { label: "Цена заявки", value: "≤ 3 000 ₽", hint: "ориентир" },
                ],
              },
              {
                type: "stages",
                items: [
                  {
                    title: "Фундамент доверия",
                    period: "Сентябрь",
                    points: ["Обновить карточки в Яндекс Картах и 2ГИС", "Собрать 15 видеоотзывов родителей", "Запустить серию «День в Little Feet»"],
                  },
                  {
                    title: "Привлечение",
                    period: "Октябрь",
                    points: ["Таргет VK на родителей в радиусе 3 км", "Лид-магнит: чек-лист «Как выбрать сад»", "Партнёрства с детскими клиниками"],
                  },
                  {
                    title: "Конверсия",
                    period: "Ноябрь",
                    points: ["Открытые экскурсии каждую субботу", "Скрипт звонка для администратора", "Повторное касание через 3 дня после экскурсии"],
                  },
                ],
              },
              {
                type: "callout",
                tone: "warning",
                text: "Проверьте ограничения на рекламу детских учреждений и согласие родителей на публикацию фото детей.",
              },
              {
                type: "checklist",
                title: "Следующие шаги",
                items: [
                  { id: "c-1", text: "Согласовать бюджет с владельцем", done: true },
                  { id: "c-2", text: "Назначить ответственного за отзывы", done: false },
                  { id: "c-3", text: "Подготовить креативы для таргета", done: false },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "t-sb-competitors",
      title: "Конкуренты: морская кухня в центре",
      projectId: "p-sea-bottom",
      scenarioId: "competitors",
      createdAt: ago(1, 4),
      updatedAt: ago(1, 3),
      messages: [
        {
          id: "m-sb-1",
          role: "user",
          createdAt: ago(1, 4),
          text: "Сравни нас с тремя ближайшими конкурентами: позиционирование, средний чек, каналы и слабые места.",
        },
        {
          id: "m-sb-2",
          role: "assistant",
          createdAt: ago(1, 3),
          text: "Сравнение готово. У «Си Батом» есть незанятая ниша — будние деловые обеды с морепродуктами.",
          result: {
            kind: "competitors",
            title: "Конкурентный анализ: морская кухня, центр Санкт-Петербурга",
            summary:
              "Конкуренты делают ставку на вечерний трафик и туристов. Будние дни и деловая аудитория закрыты слабо — это главный резерв роста загрузки.",
            status: "approved",
            blocks: [
              {
                type: "table",
                caption: "Сравнение по ключевым параметрам",
                columns: ["Конкурент", "Позиционирование", "Средний чек", "Сильные каналы", "Слабое место"],
                rows: [
                  ["Устричная «Мидия»", "Демократичный устричный бар", "1 900 ₽", "VK, блогеры", "Нет бизнес-ланчей"],
                  ["Fish Point", "Fast-casual, доставка", "1 200 ₽", "Яндекс Еда", "Низкое доверие к качеству"],
                  ["Рыбный рынок «Причал»", "Гастромаркет", "2 400 ₽", "Туристические гиды", "Шумно, не для встреч"],
                  ["Си Батом", "Свежие морепродукты, открытая кухня", "2 800 ₽", "Telegram-канал", "Мало отзывов о будних днях"],
                ],
              },
              {
                type: "list",
                items: [
                  "Запустить деловой сет 12:00–16:00 с подачей за 20 минут.",
                  "Упаковать «48 часов от моря до стола» в визуальную историю для VK.",
                  "Собрать отзывы гостей бизнес-ланчей и закрепить их в картах.",
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "t-forma-content",
      title: "Контент-план на декабрь",
      projectId: "p-forma",
      scenarioId: "content-plan",
      createdAt: ago(2, 6),
      updatedAt: ago(2, 5),
      messages: [
        {
          id: "m-fo-1",
          role: "user",
          createdAt: ago(2, 6),
          text: "Нужен контент-план на первую неделю декабря для VK и Telegram. Акцент на пробную тренировку.",
        },
        {
          id: "m-fo-2",
          role: "assistant",
          createdAt: ago(2, 5),
          text: "Вот черновик на первую неделю. Остальные недели соберу после вашего согласования формата.",
          result: {
            kind: "content-plan",
            title: "Контент-план Форма Studio: 1–7 декабря",
            summary: "Неделя построена вокруг пробной тренировки: от боли офисного сотрудника к простому первому шагу.",
            status: "draft",
            blocks: [
              {
                type: "table",
                columns: ["День", "Канал", "Формат", "Тема", "CTA"],
                rows: [
                  ["Пн", "VK", "Карусель", "5 признаков, что спина устала от офиса", "Записаться на пробную"],
                  ["Вт", "Telegram", "Пост", "Как проходит первая тренировка", "Задать вопрос тренеру"],
                  ["Ср", "VK", "Клип", "Разминка за 3 минуты у рабочего стола", "Сохранить"],
                  ["Чт", "Telegram", "Опрос", "Когда вам удобнее тренироваться?", "Ответить"],
                  ["Пт", "VK", "Отзыв", "История клиента: −6 кг за 3 месяца", "Записаться на пробную"],
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "t-lf-usp",
      title: "УТП для страницы экскурсий",
      projectId: "p-little-feet",
      scenarioId: "positioning",
      createdAt: ago(4, 3),
      updatedAt: ago(4, 2),
      messages: [
        {
          id: "m-usp-1",
          role: "user",
          createdAt: ago(4, 3),
          text: "Предложи 3 формулировки УТП для лендинга с записью на экскурсию.",
        },
        {
          id: "m-usp-2",
          role: "assistant",
          createdAt: ago(4, 2),
          text: "Три варианта с разным акцентом:",
          result: {
            kind: "positioning",
            title: "Варианты УТП для страницы экскурсий",
            summary: "Каждая формулировка отвечает на главный страх родителей: ребёнку будет некомфортно в большой группе.",
            status: "approved",
            blocks: [
              {
                type: "list",
                ordered: true,
                items: [
                  "Сад, где воспитатель знает каждого: группы до 12 детей и английский каждый день.",
                  "Билингвальное детство без доплат: английский с носителем, бассейн и кружки уже в стоимости.",
                  "Приходите на экскурсию в субботу — покажем, как проходит обычный день вашего ребёнка.",
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "t-mb-audience",
      title: "Портрет аудитории для марафона",
      projectId: "p-my-brand",
      scenarioId: "audience",
      createdAt: ago(3, 3),
      updatedAt: ago(3, 2),
      messages: [
        {
          id: "m-mb-1",
          role: "user",
          createdAt: ago(3, 3),
          text: "Помоги описать аудиторию для марафона по питанию.",
        },
        {
          id: "m-mb-2",
          role: "assistant",
          createdAt: ago(3, 2),
          text:
            "Чтобы портрет был точным, уточните в контексте проекта: возраст и род занятий участников прошлых консультаций, их главные запросы и что их останавливает от покупки. Сейчас эти поля в карточке бренда пустые.",
        },
      ],
    },
    {
      id: "t-sb-brunch",
      title: "Тексты для рекламы бранча",
      projectId: "p-sea-bottom",
      scenarioId: "ad-copy",
      createdAt: ago(6, 1),
      updatedAt: ago(6),
      messages: [
        {
          id: "m-br-1",
          role: "user",
          createdAt: ago(6, 1),
          text: "Нужно 3 коротких текста для рекламы субботнего бранча в VK.",
        },
        {
          id: "m-br-2",
          role: "assistant",
          createdAt: ago(6),
          text: "Три варианта до 120 символов:",
          result: {
            kind: "ad-copy",
            title: "Рекламные тексты: субботний бранч",
            summary: "Тексты для объявлений VK Рекламы, тон — гастрономичный с лёгкой иронией.",
            status: "review",
            blocks: [
              {
                type: "list",
                items: [
                  "Суббота начинается с устриц. Бранч в «Си Батом» с 12:00 — бронируйте стол заранее.",
                  "Краб, игристое и никакой спешки. Бранч по субботам на открытой кухне.",
                  "Море в центре Петербурга: бранч-сет на двоих по субботам. Свежий улов за 48 часов.",
                ],
              },
            ],
          },
        },
      ],
    },
  ];

  const documents: DocumentItem[] = [
    { id: "d-1", name: "Стратегия продвижения Little Feet — осень.docx", kind: "doc", projectId: "p-little-feet", source: "ai", sizeKb: 84, updatedAt: ago(0, 1), favorite: true, summary: "Трёхэтапная стратегия на сентябрь–ноябрь с бюджетом и KPI." },
    { id: "d-2", name: "Конкурентный анализ — морская кухня СПб.xlsx", kind: "sheet", projectId: "p-sea-bottom", source: "ai", sizeKb: 46, updatedAt: ago(1, 2), favorite: true, summary: "Сравнение трёх конкурентов по позиционированию, среднему чеку и каналам." },
    { id: "d-3", name: "Контент-план декабрь — Форма Studio.xlsx", kind: "sheet", projectId: "p-forma", source: "ai", sizeKb: 38, updatedAt: ago(2, 4), favorite: false, summary: "Публикации на первую неделю декабря для VK и Telegram." },
    { id: "d-4", name: "Презентация для родителей — день открытых дверей.pptx", kind: "slides", projectId: "p-little-feet", source: "template", sizeKb: 5_320, updatedAt: ago(3, 6), favorite: false, summary: "12 слайдов о программе, команде и распорядке дня." },
    { id: "d-5", name: "Меню бранча — карточки для VK.png", kind: "card", projectId: "p-sea-bottom", source: "ai", sizeKb: 1_480, updatedAt: ago(5, 1), favorite: false, summary: "Серия из 4 карточек с позициями бранч-меню." },
    { id: "d-6", name: "Брендбук Форма Studio.pdf", kind: "pdf", projectId: "p-forma", source: "upload", sizeKb: 12_900, updatedAt: ago(8), favorite: true, summary: "Логотип, цвета, шрифты и правила фотосъёмки." },
    { id: "d-7", name: "Прайс-лист 2026.pdf", kind: "pdf", projectId: "p-little-feet", source: "upload", sizeKb: 640, updatedAt: ago(9, 3), favorite: false, summary: "Стоимость групп полного и неполного дня." },
    { id: "d-8", name: "Бриф на съёмку — устричный бар.docx", kind: "doc", projectId: "p-sea-bottom", source: "template", sizeKb: 52, updatedAt: ago(11), favorite: false, summary: "Референсы, список кадров и тайминг съёмочного дня." },
    { id: "d-9", name: "Медиаплан Q1 2027.xlsx", kind: "sheet", projectId: "p-sea-bottom", source: "template", sizeKb: 61, updatedAt: ago(12, 2), favorite: false, summary: "Распределение бюджета по каналам на январь–март." },
    { id: "d-10", name: "Карточки отзывов родителей.png", kind: "card", projectId: "p-little-feet", source: "ai", sizeKb: 2_210, updatedAt: ago(14), favorite: false, summary: "6 карточек с цитатами родителей для VK и сторис." },
    { id: "d-11", name: "Питч-дек марафона «Ешь и живи».pptx", kind: "slides", projectId: "p-my-brand", source: "ai", sizeKb: 3_870, updatedAt: ago(4, 5), favorite: false, summary: "Черновик презентации марафона: программа, формат, стоимость." },
    { id: "d-12", name: "Логотип Тёплый дом (исходники).zip", kind: "file", projectId: "p-warm-home", source: "upload", sizeKb: 24_600, updatedAt: ago(70), favorite: false, summary: "Векторные исходники логотипа и фирменного паттерна." },
    {
      id: "d-13",
      name: "Отчёт по сезону — Тёплый дом. Итоги продаж пледов на маркетплейсах и рекомендации на следующий сезон.pdf",
      kind: "pdf",
      projectId: "p-warm-home",
      source: "upload",
      sizeKb: 3_140,
      updatedAt: ago(64),
      favorite: false,
      summary: "Итоги сезона октябрь–февраль, динамика продаж по площадкам и выводы.",
    },
    { id: "d-14", name: "Чек-лист запуска рекламной кампании.docx", kind: "doc", projectId: null, source: "template", sizeKb: 28, updatedAt: ago(20), favorite: false, summary: "Универсальный чек-лист перед запуском рекламы." },
  ];

  const templates: DocumentTemplate[] = [
    { id: "tpl-competitors", name: "Конкурентный анализ", kind: "sheet", scenarioId: "competitors", description: "Таблица сравнения 3–5 конкурентов по позиционированию, цене и каналам." },
    { id: "tpl-content", name: "Контент-план на месяц", kind: "sheet", scenarioId: "content-plan", description: "Календарь публикаций с форматами, темами и целевыми действиями." },
    { id: "tpl-strategy", name: "Стратегия продвижения", kind: "doc", scenarioId: "strategy", description: "Цели, этапы, каналы и метрики на квартал." },
    { id: "tpl-audience", name: "Портрет аудитории", kind: "doc", scenarioId: "audience", description: "Сегменты, мотивы, возражения и триггеры покупки." },
    { id: "tpl-pitch", name: "Презентация для клиента", kind: "slides", scenarioId: "positioning", description: "Структура питча: проблема, решение, доказательства, предложение." },
    { id: "tpl-cards", name: "Карточки для соцсетей", kind: "card", scenarioId: "ad-copy", description: "Серия карточек с единым стилем для VK и Telegram." },
  ];

  return { projects, threads, documents, templates };
}
