import type { SupportedLocale } from '@lodariq/i18n';

type RuntimeCatalog = Readonly<Record<string, string>>;

const EMPTY_CATALOG: RuntimeCatalog = {};

const DE_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Lassen Sie das Popup zu und versuchen Sie es erneut',
  'Authoring open': 'Authoring geöffnet',
  'Browse experiences — close current authoring first':
    'Durchsuchen Sie Erfahrungen – schließen Sie zuerst die aktuelle Erstellung',
  'Choose an experience type to start.': 'Wählen Sie zum Starten einen Erlebnistyp.',
  'Close current authoring before opening another experience':
    'Schließen Sie die aktuelle Erstellung, bevor Sie ein anderes Erlebnis öffnen',
  'Connecting to Lodariq': 'Verbindung mit Lodariq herstellen',
  'Connecting…': 'Verbinden…',
  'Could not connect. Try again':
    'Es konnte keine Verbindung hergestellt werden. Versuchen Sie es erneut',
  'Experiences on this page': 'Erfahrungen auf dieser Seite',
  'Guide people through a sequence of steps.':
    'Führen Sie Menschen durch eine Abfolge von Schritten.',
  'Hide Lodariq': 'Lodariq verstecken',
  'Lodariq actions': 'Lodariq-Aktionen',
  'Minimize Lodariq authoring': 'Minimieren Sie das Lodariq-Authoring',
  'New experience': 'Neue Erfahrung',
  'New experience — close current authoring first':
    'Neue Erfahrung – schließen Sie zuerst die aktuelle Dokumenterstellung',
  'No published experience is available to preview':
    'Es steht keine veröffentlichte Erfahrung zur Vorschau zur Verfügung',
  'Open Lodariq actions': 'Öffnen Sie Lodariq-Aktionen',
  'Preview as user': 'Vorschau als Benutzer',
  'Preview could not start': 'Die Vorschau konnte nicht gestartet werden',
  'Restore Lodariq authoring': 'Stellen Sie die Lodariq-Erstellung wieder her',
  'Starting Lodariq preview': 'Lodariq-Vorschau starten',
  'Starting preview…': 'Vorschau wird gestartet…',
  Tour: 'Rundgang',
};

const FR_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Autorisez le popup, puis réessayez',
  'Authoring open': 'Création ouverte',
  'Browse experiences — close current authoring first':
    "Parcourir les expériences – fermer d'abord la création actuelle",
  'Choose an experience type to start.': "Choisissez un type d'expérience pour commencer.",
  'Close current authoring before opening another experience':
    "Fermer la création actuelle avant d'ouvrir une autre expérience",
  'Connecting to Lodariq': 'Connexion à Lodariq',
  'Connecting…': 'Connexion…',
  'Could not connect. Try again': 'Impossible de se connecter. Réessayez',
  'Experiences on this page': 'Expériences sur cette page',
  'Guide people through a sequence of steps.': 'Guidez les gens à travers une séquence d’étapes.',
  'Hide Lodariq': 'Masquer Lodariq',
  'Lodariq actions': 'Actions Lodariq',
  'Minimize Lodariq authoring': 'Réduire la création Lodariq',
  'New experience': 'Nouvelle expérience',
  'New experience — close current authoring first':
    "Nouvelle expérience : fermez d'abord la création actuelle",
  'No published experience is available to preview':
    "Aucune expérience publiée n'est disponible en aperçu",
  'Open Lodariq actions': 'Ouvrir les actions Lodariq',
  'Preview as user': "Aperçu en tant qu'utilisateur",
  'Preview could not start': "L'aperçu n'a pas pu démarrer",
  'Restore Lodariq authoring': 'Restaurer la création Lodariq',
  'Starting Lodariq preview': "Démarrage de l'aperçu de Lodariq",
  'Starting preview…': "Démarrage de l'aperçu…",
  Tour: 'Visite',
};

const ES_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Permita la ventana emergente, luego vuelva a intentarlo',
  'Authoring open': 'Autoría abierta',
  'Browse experiences — close current authoring first':
    'Explorar experiencias: cerrar primero la creación actual',
  'Choose an experience type to start.': 'Elija un tipo de experiencia para comenzar.',
  'Close current authoring before opening another experience':
    'Cerrar la creación actual antes de abrir otra experiencia',
  'Connecting to Lodariq': 'Conectándose a Lodariq',
  'Connecting…': 'Conectando…',
  'Could not connect. Try again': 'No se pudo conectar. Inténtalo de nuevo',
  'Experiences on this page': 'Experiencias en esta página',
  'Guide people through a sequence of steps.':
    'Guíe a las personas a través de una secuencia de pasos.',
  'Hide Lodariq': 'Ocultar Lodariq',
  'Lodariq actions': 'Acciones de Lodariq',
  'Minimize Lodariq authoring': 'Minimizar la creación de Lodariq',
  'New experience': 'Nueva experiencia',
  'New experience — close current authoring first':
    'Nueva experiencia: cierre primero la creación actual',
  'No published experience is available to preview':
    'No hay ninguna experiencia publicada disponible para obtener una vista previa',
  'Open Lodariq actions': 'Acciones abiertas de Lodariq',
  'Preview as user': 'Vista previa como usuario',
  'Preview could not start': 'No se pudo iniciar la vista previa',
  'Restore Lodariq authoring': 'Restaurar la autoría de Lodariq',
  'Starting Lodariq preview': 'Iniciando la vista previa de Lodariq',
  'Starting preview…': 'Iniciando vista previa…',
  Tour: 'Gira',
};

const PT_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Permita o pop-up e tente novamente',
  'Authoring open': 'Autoria aberta',
  'Browse experiences — close current authoring first':
    'Procure experiências – feche primeiro a autoria atual',
  'Choose an experience type to start.': 'Escolha um tipo de experiência para começar.',
  'Close current authoring before opening another experience':
    'Feche a criação atual antes de abrir outra experiência',
  'Connecting to Lodariq': 'Conectando-se ao Lodariq',
  'Connecting…': 'Conectando…',
  'Could not connect. Try again': 'Não foi possível conectar. Tente novamente',
  'Experiences on this page': 'Experiências nesta página',
  'Guide people through a sequence of steps.':
    'Guie as pessoas através de uma sequência de etapas.',
  'Hide Lodariq': 'Esconder Lodariq',
  'Lodariq actions': 'Ações Lodariq',
  'Minimize Lodariq authoring': 'Minimize a autoria do Lodariq',
  'New experience': 'Nova experiência',
  'New experience — close current authoring first':
    'Nova experiência – feche primeiro a autoria atual',
  'No published experience is available to preview':
    'Nenhuma experiência publicada está disponível para visualização',
  'Open Lodariq actions': 'Abrir ações do Lodariq',
  'Preview as user': 'Visualizar como usuário',
  'Preview could not start': 'Não foi possível iniciar a visualização',
  'Restore Lodariq authoring': 'Restaurar a autoria do Lodariq',
  'Starting Lodariq preview': 'Iniciando a visualização do Lodariq',
  'Starting preview…': 'Iniciando visualização…',
  Tour: 'Passeio',
};

const AR_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'اسمح بالنافذة المنبثقة، ثم أعد المحاولة',
  'Authoring open': 'التأليف مفتوح',
  'Browse experiences — close current authoring first': 'تصفح التجارب — أغلق التأليف الحالي أولاً',
  'Choose an experience type to start.': 'اختر نوع الخبرة للبدء.',
  'Close current authoring before opening another experience':
    'أغلق التأليف الحالي قبل فتح تجربة أخرى',
  'Connecting to Lodariq': 'الاتصال لوداريق',
  'Connecting…': 'جارٍ الاتصال…',
  'Could not connect. Try again': 'لا يمكن الاتصال. حاول مرة أخرى',
  'Experiences on this page': 'الخبرات الموجودة في هذه الصفحة',
  'Guide people through a sequence of steps.': 'توجيه الناس من خلال سلسلة من الخطوات.',
  'Hide Lodariq': 'إخفاء لوداريق',
  'Lodariq actions': 'أفعال لوداريق',
  'Minimize Lodariq authoring': 'تصغير تأليف لوداريق',
  'New experience': 'تجربة جديدة',
  'New experience — close current authoring first': 'تجربة جديدة - أغلق التأليف الحالي أولاً',
  'No published experience is available to preview': 'لا توجد تجربة منشورة متاحة للمعاينة',
  'Open Lodariq actions': 'افتح إجراءات لوداريق',
  'Preview as user': 'معاينة كمستخدم',
  'Preview could not start': 'تعذر بدء المعاينة',
  'Restore Lodariq authoring': 'استعادة تأليف لوداريق',
  'Starting Lodariq preview': 'بدء معاينة لوداريق',
  'Starting preview…': 'جارٍ بدء المعاينة…',
  Tour: 'جولة',
};

const TR_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Açılır pencereye izin verin ve ardından yeniden deneyin',
  'Authoring open': 'Yazma açık',
  'Browse experiences — close current authoring first':
    'Deneyimlere göz atın — önce mevcut yazmayı kapatın',
  'Choose an experience type to start.': 'Başlamak için bir deneyim türü seçin.',
  'Close current authoring before opening another experience':
    'Başka bir deneyim açmadan önce mevcut yazmayı kapatın',
  'Connecting to Lodariq': "Lodariq'e bağlanma",
  'Connecting…': 'Bağlanıyor…',
  'Could not connect. Try again': 'Bağlantı kurulamadı. Tekrar dene',
  'Experiences on this page': 'Bu sayfadaki deneyimler',
  'Guide people through a sequence of steps.': 'İnsanları bir dizi adım boyunca yönlendirin.',
  'Hide Lodariq': "Lodariq'i gizle",
  'Lodariq actions': 'Lodariq eylemleri',
  'Minimize Lodariq authoring': 'Lodariq yazmayı en aza indirin',
  'New experience': 'Yeni deneyim',
  'New experience — close current authoring first': 'Yeni deneyim — önce mevcut yazmayı kapatın',
  'No published experience is available to preview': 'Önizlenecek yayınlanmış deneyim yok',
  'Open Lodariq actions': 'Lodariq eylemlerini aç',
  'Preview as user': 'Kullanıcı olarak önizle',
  'Preview could not start': 'Önizleme başlatılamadı',
  'Restore Lodariq authoring': 'Lodariq yazmayı geri yükle',
  'Starting Lodariq preview': 'Lodariq önizlemesi başlatılıyor',
  'Starting preview…': 'Önizleme başlatılıyor…',
  Tour: 'Tur',
};

const IT_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Consenti il popup, quindi riprova',
  'Authoring open': 'Creazione aperta',
  'Browse experiences — close current authoring first':
    'Sfoglia le esperienze: chiudi prima la creazione corrente',
  'Choose an experience type to start.': 'Scegli un tipo di esperienza per iniziare.',
  'Close current authoring before opening another experience':
    "Chiudi la creazione corrente prima di aprire un'altra esperienza",
  'Connecting to Lodariq': 'Collegamento a Lodariq',
  'Connecting…': 'Connessione…',
  'Could not connect. Try again': 'Impossibile connettersi. Riprova',
  'Experiences on this page': 'Esperienze in questa pagina',
  'Guide people through a sequence of steps.':
    'Guida le persone attraverso una sequenza di passaggi.',
  'Hide Lodariq': 'Nascondi Lodariq',
  'Lodariq actions': 'Azioni di Lodariq',
  'Minimize Lodariq authoring': 'Riduci al minimo la creazione di Lodariq',
  'New experience': 'Nuova esperienza',
  'New experience — close current authoring first':
    'Nuova esperienza: chiudi prima la creazione corrente',
  'No published experience is available to preview':
    "Nessuna esperienza pubblicata è disponibile per l'anteprima",
  'Open Lodariq actions': 'Apri le azioni Lodariq',
  'Preview as user': 'Anteprima come utente',
  'Preview could not start': "Impossibile avviare l'anteprima",
  'Restore Lodariq authoring': 'Ripristina la creazione di Lodariq',
  'Starting Lodariq preview': "Avvio dell'anteprima di Lodariq",
  'Starting preview…': 'Avvio anteprima…',
  Tour: 'Giro',
};

const NL_BE_CATALOG: RuntimeCatalog = {
  'Allow the popup, then retry': 'Sta de pop-up toe en probeer het opnieuw',
  'Authoring open': 'Auteursrecht geopend',
  'Browse experiences — close current authoring first':
    'Blader door ervaringen - sluit eerst de huidige auteur',
  'Choose an experience type to start.': 'Kies een ervaringstype om te beginnen.',
  'Close current authoring before opening another experience':
    'Sluit het huidige ontwerp voordat u een andere ervaring opent',
  'Connecting to Lodariq': 'Verbinding maken met Lodariq',
  'Connecting…': 'Verbinden…',
  'Could not connect. Try again': 'Kan geen verbinding maken. Probeer het opnieuw',
  'Experiences on this page': 'Ervaringen op deze pagina',
  'Guide people through a sequence of steps.': 'Leid mensen door een reeks stappen.',
  'Hide Lodariq': 'Verberg Lodariq',
  'Lodariq actions': 'Lodariq-acties',
  'Minimize Lodariq authoring': 'Minimaliseer het schrijven van Lodariq',
  'New experience': 'Nieuwe ervaring',
  'New experience — close current authoring first':
    'Nieuwe ervaring: sluit eerst de huidige auteur',
  'No published experience is available to preview':
    'Er is geen gepubliceerde ervaring beschikbaar om een voorbeeld van te bekijken',
  'Open Lodariq actions': 'Open Lodariq-acties',
  'Preview as user': 'Bekijk een voorbeeld als gebruiker',
  'Preview could not start': 'Voorbeeld kan niet starten',
  'Restore Lodariq authoring': 'Herstel Lodariq-auteurschap',
  'Starting Lodariq preview': 'Lodariq-voorbeeld starten',
  'Starting preview…': 'Voorbeeld starten…',
  Tour: 'Rondleiding',
};

export const RUNTIME_CATALOGS: Readonly<Record<SupportedLocale, RuntimeCatalog>> = {
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
