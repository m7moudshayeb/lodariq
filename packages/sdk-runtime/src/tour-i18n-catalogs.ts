import type { SupportedLocale } from '@lodariq/i18n';

type TourRuntimeCatalog = Readonly<Record<string, string>>;

const EMPTY_CATALOG: TourRuntimeCatalog = {};

const DE_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq konnte nicht finden, worauf dieser Schritt auf dieser Seite zeigt',
  'Announcement: {label}': 'Ankündigung: {label}',
  'Exit tour': 'Tour beenden',
  'Keyboard focus order': 'Tastatur-Fokusreihenfolge',
  'Lodariq tour': 'Lodariq-Tour',
  'Lodariq tour has no presentable step': 'Die Lodariq-Tour hat keine vorzeigbare Stufe',
  'Lodariq tour has not started': 'Die Lodariq-Tour hat noch nicht begonnen',
  'Lodariq tour presentation is unavailable':
    'Die Präsentation der Lodariq-Tour ist nicht verfügbar',
  'Lodariq tour presentation was canceled': 'Die Präsentation der Lodariq-Tour wurde abgesagt',
  'Screen-reader announcement log': 'Protokoll der Screenreader-Ankündigungen',
  'Skip step': 'Schritt überspringen',
  'This step could not continue.': 'Dieser Schritt konnte nicht fortgesetzt werden.',
  'Tour complete': 'Tour abgeschlossen',
  'Tour path selected': 'Tourpfad ausgewählt',
  'Try again': 'Erneut versuchen',
  'Unlabeled control': 'Steuerelement ohne Beschriftung',
  'Waiting for the next condition': 'Warten auf die nächste Bedingung',
  '{number}. {label}': '{number}. {label}',
};

const FR_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq n’a pas trouvé ce que cette étape désigne sur cette page',
  'Announcement: {label}': 'Annonce : {label}',
  'Exit tour': 'Quitter la visite',
  'Keyboard focus order': 'Ordre de focus au clavier',
  'Lodariq tour': 'Visite de Lodariq',
  'Lodariq tour has no presentable step': "La tournée Lodariq n'a pas d'étape présentable",
  'Lodariq tour has not started': "La tournée Lodariq n'a pas commencé",
  'Lodariq tour presentation is unavailable':
    "La présentation de la tournée Lodariq n'est pas disponible",
  'Lodariq tour presentation was canceled': 'La présentation de la tournée Lodariq a été annulée',
  'Screen-reader announcement log': 'Journal des annonces du lecteur d’écran',
  'Skip step': 'Passer l’étape',
  'This step could not continue.': 'Cette étape n’a pas pu continuer.',
  'Tour complete': 'Visite terminée',
  'Tour path selected': 'Parcours de visite sélectionné',
  'Try again': 'Réessayer',
  'Unlabeled control': 'Contrôle sans libellé',
  'Waiting for the next condition': 'En attente de la condition suivante',
  '{number}. {label}': '{number}. {label}',
};

const ES_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq no encontró en esta página aquello a lo que apunta este paso',
  'Announcement: {label}': 'Anuncio: {label}',
  'Exit tour': 'Salir del recorrido',
  'Keyboard focus order': 'Orden de enfoque del teclado',
  'Lodariq tour': 'gira por lodariq',
  'Lodariq tour has no presentable step': 'La gira de Lodariq no tiene paso presentable',
  'Lodariq tour has not started': 'La gira de Lodariq no ha comenzado.',
  'Lodariq tour presentation is unavailable':
    'La presentación de la gira de Lodariq no está disponible.',
  'Lodariq tour presentation was canceled': 'La presentación de la gira de Lodariq fue cancelada',
  'Screen-reader announcement log': 'Registro de anuncios del lector de pantalla',
  'Skip step': 'Omitir paso',
  'This step could not continue.': 'No se pudo continuar con este paso.',
  'Tour complete': 'Recorrido completado',
  'Tour path selected': 'Ruta del recorrido seleccionada',
  'Try again': 'Intentar de nuevo',
  'Unlabeled control': 'Control sin etiqueta',
  'Waiting for the next condition': 'Esperando la siguiente condición',
  '{number}. {label}': '{number}. {label}',
};

const PT_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'O Lodariq não encontrou nesta página aquilo a que esta etapa aponta',
  'Announcement: {label}': 'Anúncio: {label}',
  'Exit tour': 'Sair do tour',
  'Keyboard focus order': 'Ordem de foco do teclado',
  'Lodariq tour': 'Passeio em Lodariq',
  'Lodariq tour has no presentable step': 'O tour de Lodariq não tem etapa apresentável',
  'Lodariq tour has not started': 'A turnê de Lodariq não começou',
  'Lodariq tour presentation is unavailable': 'A apresentação do tour Lodariq não está disponível',
  'Lodariq tour presentation was canceled': 'A apresentação da turnê Lodariq foi cancelada',
  'Screen-reader announcement log': 'Registro de anúncios do leitor de tela',
  'Skip step': 'Ignorar etapa',
  'This step could not continue.': 'Não foi possível continuar esta etapa.',
  'Tour complete': 'Tour concluído',
  'Tour path selected': 'Caminho do tour selecionado',
  'Try again': 'Tentar novamente',
  'Unlabeled control': 'Controle sem rótulo',
  'Waiting for the next condition': 'Aguardando a próxima condição',
  '{number}. {label}': '{number}. {label}',
};

const AR_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'لم يعثر لودارِك في هذه الصفحة على ما تشير إليه هذه الخطوة',
  'Announcement: {label}': 'الإعلان: {label}',
  'Exit tour': 'إنهاء الجولة',
  'Keyboard focus order': 'ترتيب تركيز لوحة المفاتيح',
  'Lodariq tour': 'جولة لوداريق',
  'Lodariq tour has no presentable step': 'جولة لوداريق ليس لها خطوة جيدة',
  'Lodariq tour has not started': 'جولة لوداريق لم تبدأ',
  'Lodariq tour presentation is unavailable': 'العرض التقديمي لجولة Lodariq غير متوفر',
  'Lodariq tour presentation was canceled': 'تم إلغاء العرض التقديمي لجولة Lodariq',
  'Screen-reader announcement log': 'سجل إعلانات قارئ الشاشة',
  'Skip step': 'تخطي الخطوة',
  'This step could not continue.': 'تعذّر متابعة هذه الخطوة.',
  'Tour complete': 'اكتملت الجولة',
  'Tour path selected': 'تم اختيار مسار الجولة',
  'Try again': 'حاول مرة أخرى',
  'Unlabeled control': 'عنصر تحكم بلا تسمية',
  'Waiting for the next condition': 'في انتظار الشرط التالي',
  '{number}. {label}': '{number}. {label}',
};

const TR_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq bu adımın işaret ettiği şeyi bu sayfada bulamadı',
  'Announcement: {label}': 'Duyuru: {label}',
  'Exit tour': 'Turdan çık',
  'Keyboard focus order': 'Klavye odak sırası',
  'Lodariq tour': 'Lodarik turu',
  'Lodariq tour has no presentable step': 'Lodariq turunun prezentabl bir adımı yok',
  'Lodariq tour has not started': 'Lodariq turu başlamadı',
  'Lodariq tour presentation is unavailable': 'Lodariq tur sunumu mevcut değil',
  'Lodariq tour presentation was canceled': 'Lodariq tur sunumu iptal edildi',
  'Screen-reader announcement log': 'Ekran okuyucu duyuru günlüğü',
  'Skip step': 'Adımı atla',
  'This step could not continue.': 'Bu adıma devam edilemedi.',
  'Tour complete': 'Tur tamamlandı',
  'Tour path selected': 'Tur yolu seçildi',
  'Try again': 'Tekrar dene',
  'Unlabeled control': 'Etiketsiz denetim',
  'Waiting for the next condition': 'Sonraki koşul bekleniyor',
  '{number}. {label}': '{number}. {label}',
};

const IT_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq non ha trovato in questa pagina ciò a cui punta questo passaggio',
  'Announcement: {label}': 'Annuncio: {label}',
  'Exit tour': 'Esci dal tour',
  'Keyboard focus order': 'Ordine di attivazione da tastiera',
  'Lodariq tour': 'Giro di Lodariq',
  'Lodariq tour has no presentable step': 'Il tour di Lodariq non ha passaggi presentabili',
  'Lodariq tour has not started': 'Il tour di Lodariq non è iniziato',
  'Lodariq tour presentation is unavailable':
    'La presentazione del tour di Lodariq non è disponibile',
  'Lodariq tour presentation was canceled':
    'La presentazione del tour di Lodariq è stata annullata',
  'Screen-reader announcement log': 'Registro degli annunci dello screen reader',
  'Skip step': 'Salta passaggio',
  'This step could not continue.': 'Impossibile continuare questo passaggio.',
  'Tour complete': 'Tour completato',
  'Tour path selected': 'Percorso del tour selezionato',
  'Try again': 'Riprova',
  'Unlabeled control': 'Controllo senza etichetta',
  'Waiting for the next condition': 'In attesa della condizione successiva',
  '{number}. {label}': '{number}. {label}',
};

const NL_BE_CATALOG: TourRuntimeCatalog = {
  'Lodariq could not find what this step points at on this page':
    'Lodariq vond niet waar deze stap op deze pagina naar verwijst',
  'Announcement: {label}': 'Aankondiging: {label}',
  'Exit tour': 'Rondleiding afsluiten',
  'Keyboard focus order': 'Toetsenbordfocusvolgorde',
  'Lodariq tour': 'Lodariq-tour',
  'Lodariq tour has no presentable step': 'De Lodariq-tour heeft geen presentabele stap',
  'Lodariq tour has not started': 'De Lodariq-tour is nog niet begonnen',
  'Lodariq tour presentation is unavailable': 'De Lodariq-tourpresentatie is niet beschikbaar',
  'Lodariq tour presentation was canceled': 'De tourpresentatie van Lodariq werd geannuleerd',
  'Screen-reader announcement log': 'Logboek met schermlezeraankondigingen',
  'Skip step': 'Stap overslaan',
  'This step could not continue.': 'Deze stap kon niet doorgaan.',
  'Tour complete': 'Tour voltooid',
  'Tour path selected': 'Tourpad geselecteerd',
  'Try again': 'Opnieuw proberen',
  'Unlabeled control': 'Besturingselement zonder label',
  'Waiting for the next condition': 'Wachten op de volgende voorwaarde',
  '{number}. {label}': '{number}. {label}',
};

export const TOUR_RUNTIME_CATALOGS: Readonly<Record<SupportedLocale, TourRuntimeCatalog>> = {
  en: EMPTY_CATALOG,
  de: DE_CATALOG,
  fr: FR_CATALOG,
  es: ES_CATALOG,
  pt: PT_CATALOG,
  ar: AR_CATALOG,
  tr: TR_CATALOG,
  it: IT_CATALOG,
  'nl-BE': NL_BE_CATALOG,
  'en-XA': EMPTY_CATALOG,
  'ar-XB': EMPTY_CATALOG,
};
