import type { SupportedLocale } from '@lodariq/i18n';

type ExperienceRuntimeCatalog = Readonly<Record<string, string>>;

const EMPTY_CATALOG: ExperienceRuntimeCatalog = {};

const DE_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Lodariq-Ankündigung',
  'Lodariq checklist': 'Lodariq-Checkliste',
  'Lodariq hotspot': 'Lodariq-Hotspot',
  'Lodariq survey': 'Lodariq-Umfrage',
  'Announcement complete': 'Ankündigung abgeschlossen',
  'Checklist complete': 'Checkliste abgeschlossen',
  'Hotspot complete': 'Hotspot abgeschlossen',
  'Survey complete': 'Umfrage abgeschlossen',
  Close: 'Schließen',
  'Open hotspot': 'Hotspot öffnen',
  Submit: 'Absenden',
  'Answer the question before submitting.': 'Beantworten Sie die Frage vor dem Absenden.',
  '{completed} of {total} complete': '{completed} von {total} abgeschlossen',
};

const FR_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Annonce Lodariq',
  'Lodariq checklist': 'Liste Lodariq',
  'Lodariq hotspot': 'Point interactif Lodariq',
  'Lodariq survey': 'Sondage Lodariq',
  'Announcement complete': 'Annonce terminée',
  'Checklist complete': 'Liste terminée',
  'Hotspot complete': 'Point interactif terminé',
  'Survey complete': 'Sondage terminé',
  Close: 'Fermer',
  'Open hotspot': 'Ouvrir le point interactif',
  Submit: 'Envoyer',
  'Answer the question before submitting.': 'Répondez à la question avant l’envoi.',
  '{completed} of {total} complete': '{completed} sur {total} terminés',
};

const ES_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Anuncio de Lodariq',
  'Lodariq checklist': 'Lista de Lodariq',
  'Lodariq hotspot': 'Punto interactivo de Lodariq',
  'Lodariq survey': 'Encuesta de Lodariq',
  'Announcement complete': 'Anuncio completado',
  'Checklist complete': 'Lista completada',
  'Hotspot complete': 'Punto interactivo completado',
  'Survey complete': 'Encuesta completada',
  Close: 'Cerrar',
  'Open hotspot': 'Abrir punto interactivo',
  Submit: 'Enviar',
  'Answer the question before submitting.': 'Responde la pregunta antes de enviar.',
  '{completed} of {total} complete': '{completed} de {total} completados',
};

const PT_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Anúncio Lodariq',
  'Lodariq checklist': 'Lista Lodariq',
  'Lodariq hotspot': 'Ponto interativo Lodariq',
  'Lodariq survey': 'Inquérito Lodariq',
  'Announcement complete': 'Anúncio concluído',
  'Checklist complete': 'Lista concluída',
  'Hotspot complete': 'Ponto interativo concluído',
  'Survey complete': 'Inquérito concluído',
  Close: 'Fechar',
  'Open hotspot': 'Abrir ponto interativo',
  Submit: 'Enviar',
  'Answer the question before submitting.': 'Responda à pergunta antes de enviar.',
  '{completed} of {total} complete': '{completed} de {total} concluídos',
};

const AR_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'إعلان لوداريق',
  'Lodariq checklist': 'قائمة تحقق لوداريق',
  'Lodariq hotspot': 'نقطة لوداريق التفاعلية',
  'Lodariq survey': 'استبيان لوداريق',
  'Announcement complete': 'اكتمل الإعلان',
  'Checklist complete': 'اكتملت قائمة التحقق',
  'Hotspot complete': 'اكتملت النقطة التفاعلية',
  'Survey complete': 'اكتمل الاستبيان',
  Close: 'إغلاق',
  'Open hotspot': 'فتح النقطة التفاعلية',
  Submit: 'إرسال',
  'Answer the question before submitting.': 'أجب عن السؤال قبل الإرسال.',
  '{completed} of {total} complete': 'اكتمل {completed} من {total}',
};

const TR_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Lodariq duyurusu',
  'Lodariq checklist': 'Lodariq kontrol listesi',
  'Lodariq hotspot': 'Lodariq etkileşim noktası',
  'Lodariq survey': 'Lodariq anketi',
  'Announcement complete': 'Duyuru tamamlandı',
  'Checklist complete': 'Kontrol listesi tamamlandı',
  'Hotspot complete': 'Etkileşim noktası tamamlandı',
  'Survey complete': 'Anket tamamlandı',
  Close: 'Kapat',
  'Open hotspot': 'Etkileşim noktasını aç',
  Submit: 'Gönder',
  'Answer the question before submitting.': 'Göndermeden önce soruyu yanıtlayın.',
  '{completed} of {total} complete': '{total} öğeden {completed} tamamlandı',
};

const IT_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Annuncio Lodariq',
  'Lodariq checklist': 'Elenco Lodariq',
  'Lodariq hotspot': 'Punto interattivo Lodariq',
  'Lodariq survey': 'Sondaggio Lodariq',
  'Announcement complete': 'Annuncio completato',
  'Checklist complete': 'Elenco completato',
  'Hotspot complete': 'Punto interattivo completato',
  'Survey complete': 'Sondaggio completato',
  Close: 'Chiudi',
  'Open hotspot': 'Apri punto interattivo',
  Submit: 'Invia',
  'Answer the question before submitting.': 'Rispondi alla domanda prima dell’invio.',
  '{completed} of {total} complete': '{completed} di {total} completati',
};

const NL_BE_CATALOG: ExperienceRuntimeCatalog = {
  'Lodariq announcement': 'Lodariq-aankondiging',
  'Lodariq checklist': 'Lodariq-checklist',
  'Lodariq hotspot': 'Lodariq-hotspot',
  'Lodariq survey': 'Lodariq-enquête',
  'Announcement complete': 'Aankondiging voltooid',
  'Checklist complete': 'Checklist voltooid',
  'Hotspot complete': 'Hotspot voltooid',
  'Survey complete': 'Enquête voltooid',
  Close: 'Sluiten',
  'Open hotspot': 'Hotspot openen',
  Submit: 'Verzenden',
  'Answer the question before submitting.': 'Beantwoord de vraag vóór het verzenden.',
  '{completed} of {total} complete': '{completed} van {total} voltooid',
};

export const EXPERIENCE_RUNTIME_CATALOGS: Readonly<
  Record<SupportedLocale, ExperienceRuntimeCatalog>
> = {
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
