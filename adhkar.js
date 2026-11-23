// adhkar.js — 📿 أذكار الصباح والمساء + 🕌 الجمعة في الرئيسية (2026-11-23)
// نظير lib/models/adhkar.dart + lib/services/adhkar_progress.dart +
// lib/screens/adhkar_screen.dart — **تغيير نصٍّ هنا ⇐ يُنقل إلى adhkar.dart**.
// العدّ على الجهاز وحده (localStorage «adhkar:<user>»)، ويُصفَّر حين يتغيّر اليوم.
(function () {
  'use strict';

  function D(text, o) {
    o = o || {};
    return { text: text, count: o.count || 1, source: o.source, virtue: o.virtue || null,
             only: o.only || null, evening: o.evening || null };
  }

  var ADHKAR = [
    D('﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ ' +
      'لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ ' +
      'يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ ' +
      'وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ﴾',
      { source: 'آية الكرسي — البقرة: 255',
        virtue: 'مَن قالها حين يُصبح أُجير من الجنّ حتى يُمسي، ومَن قالها حين يُمسي أُجير ' +
          'حتى يُصبح — رواه النسائي في الكبرى والحاكم، وصحّحه الألباني' }),
    D('﴿قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ ' +
      'وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ﴾',
      { count: 3, source: 'سورة الإخلاص',
        virtue: '«قل هو الله أحد والمعوّذتين حين تُمسي وحين تُصبح ثلاث مرّات تكفيك من ' +
          'كلّ شيء» — رواه أبو داود والترمذي وصحّحه' }),
    D('﴿قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ ' +
      'وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ﴾',
      { count: 3, source: 'سورة الفلق' }),
    D('﴿قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ ' +
      'مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ ' +
      'مِنَ الْجِنَّةِ وَالنَّاسِ﴾',
      { count: 3, source: 'سورة الناس' }),
    D('﴿آمَنَ الرَّسُولُ بِمَا أُنزِلَ إِلَيْهِ مِن رَّبِّهِ وَالْمُؤْمِنُونَ ۚ كُلٌّ آمَنَ بِاللَّهِ ' +
      'وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِّن رُّسُلِهِ ۚ وَقَالُوا سَمِعْنَا ' +
      'وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ ۝ لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا ۚ ' +
      'لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْ ۗ رَبَّنَا لَا تُؤَاخِذْنَا إِن نَّسِينَا أَوْ أَخْطَأْنَا ۚ ' +
      'رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِن قَبْلِنَا ۚ رَبَّنَا وَلَا ' +
      'تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنتَ مَوْلَانَا ' +
      'فَانصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ﴾',
      { source: 'خواتيم البقرة — البقرة: 285–286',
        virtue: '«مَن قرأ بالآيتين من آخر سورة البقرة في ليلةٍ كفتاه» — متّفق عليه', only: 'e' }),
    D('«أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ ' +
      'لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ ' +
      'خَيْرَ مَا فِي هَٰذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذَا الْيَوْمِ ' +
      'وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ ' +
      'فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ»',
      { source: 'رواه مسلم',
        evening: '«أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ ' +
          'لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ ' +
          'خَيْرَ مَا فِي هَٰذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَٰذِهِ ' +
          'اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ ' +
          'مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ»' }),
    D('«اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ»',
      { source: 'رواه أبو داود والترمذي وحسّنه',
        evening: '«اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ»' }),
    D('«اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ ' +
      'وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، ' +
      'وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ»',
      { source: 'سيّد الاستغفار — رواه البخاري',
        virtue: 'مَن قاله موقنًا به فمات من يومه أو ليلته دخل الجنّة' }),
    D('«أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا ' +
      'مُحَمَّدٍ ﷺ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا وَمَا كَانَ مِنَ الْمُشْرِكِينَ»',
      { source: 'رواه أحمد، وصحّحه الألباني',
        evening: '«أَمْسَيْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا ' +
          'مُحَمَّدٍ ﷺ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا وَمَا كَانَ مِنَ الْمُشْرِكِينَ»' }),
    D('«اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ ' +
      'الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي، ' +
      'وَآمِنْ رَوْعَاتِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ، وَمِنْ خَلْفِي، وَعَنْ يَمِينِي، وَعَنْ ' +
      'شِمَالِي، وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي»',
      { source: 'رواه أبو داود وابن ماجه، وصحّحه الألباني' }),
    D('«اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ ' +
      'وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ ' +
      'الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءًا أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ»',
      { source: 'رواه أبو داود والترمذي وصحّحه' }),
    D('«يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي ' +
      'إِلَى نَفْسِي طَرْفَةَ عَيْنٍ»',
      { source: 'رواه النسائي في الكبرى والحاكم، وحسّنه الألباني' }),
    D('«بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، ' +
      'وَهُوَ السَّمِيعُ الْعَلِيمُ»',
      { count: 3, source: 'رواه أبو داود والترمذي وصحّحه', virtue: 'لم يضرّه شيء' }),
    D('«أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ»',
      { count: 3, source: 'رواه مسلم', only: 'e' }),
    D('«سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، ' +
      'وَمِدَادَ كَلِمَاتِهِ»',
      { count: 3, source: 'رواه مسلم', only: 'm' }),
    D('«لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ ' +
      'عَلَى كُلِّ شَيْءٍ قَدِيرٌ»',
      { count: 10, source: 'متّفق عليه',
        virtue: 'مَن قالها عشر مرّات كان كمن أعتق أربعة أنفسٍ من ولد إسماعيل' }),
    D('«سُبْحَانَ اللَّهِ وَبِحَمْدِهِ»',
      { count: 100, source: 'رواه مسلم',
        virtue: 'مَن قالها حين يُصبح وحين يُمسي مئة مرّة لم يأتِ أحدٌ يوم القيامة بأفضل ' +
          'ممّا جاء به، إلّا أحدٌ قال مثل ما قال أو زاد عليه' })
  ];

  var KAHF_PAGE = 293;
  var SALAWAT_SHORT = 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ';
  var IBRAHIMIYYA = D('«اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ ' +
    'وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ، اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ ' +
    'مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ»',
    { source: 'الصلاة الإبراهيمية — رواه البخاري' });
  var HADITH = {
    hour: ['«يومُ الجمعة ثنتا عشرة ساعة، لا يُوجد عبدٌ مسلمٌ يسأل الله شيئًا إلّا آتاه ' +
      'إيّاه، فالتمسوها آخرَ ساعةٍ بعد العصر»', 'رواه أبو داود والنسائي، وصحّحه الألباني'],
    sala: ['«إنّ من أفضل أيّامكم يومَ الجمعة… فأكثروا عليَّ من الصلاة فيه، فإنّ ' +
      'صلاتكم معروضةٌ عليَّ»', 'رواه أبو داود، وصحّحه الألباني'],
    salaV: ['«مَن صلّى عليَّ واحدةً صلّى الله عليه عشرًا»', 'رواه مسلم']
  };
  var DUAS = [
    D('﴿رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ﴾', { source: 'البقرة: 201' }),
    D('﴿رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً ۚ ' +
      'إِنَّكَ أَنتَ الْوَهَّابُ﴾', { source: 'آل عمران: 8' }),
    D('﴿رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا ' +
      'لِلْمُتَّقِينَ إِمَامًا﴾', { source: 'الفرقان: 74' }),
    D('﴿رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِن ذُرِّيَّتِي ۚ رَبَّنَا وَتَقَبَّلْ دُعَاءِ﴾', { source: 'إبراهيم: 40' }),
    D('﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾', { source: 'طه: 114' }),
    D('«اللَّهُمَّ اجْعَلِ الْقُرْآنَ رَبِيعَ قَلْبِي، وَنُورَ صَدْرِي، وَجَلَاءَ حُزْنِي، ' +
      'وَذَهَابَ هَمِّي»', { source: 'رواه أحمد، وصحّحه ابن حبّان والألباني' }),
    D('«اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا»',
      { source: 'رواه الترمذي وابن ماجه، وصحّحه الألباني' }),
    D('«اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى، وَالْعَفَافَ وَالْغِنَى»', { source: 'رواه مسلم' }),
    D('«اللَّهُمَّ أَصْلِحْ لِي دِينِيَ الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ ' +
      'الَّتِي فِيهَا مَعَاشِي، وَأَصْلِحْ لِي آخِرَتِي الَّتِي فِيهَا مَعَادِي، وَاجْعَلِ الْحَيَاةَ ' +
      'زِيَادَةً لِي فِي كُلِّ خَيْرٍ، وَاجْعَلِ الْمَوْتَ رَاحَةً لِي مِنْ كُلِّ شَرٍّ»', { source: 'رواه مسلم' }),
    D('«يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ»', { source: 'رواه الترمذي وحسّنه' }),
    D('«اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي»', { source: 'رواه الترمذي وصحّحه' }),
    D('«اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، ' +
      'وَالْبُخْلِ وَالْجُبْنِ، وَضَلَعِ الدَّيْنِ وَغَلَبَةِ الرِّجَالِ»', { source: 'رواه البخاري' }),
    D('«اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ، وَأَعُوذُ بِكَ مِنَ النَّارِ»',
      { source: 'رواه أبو داود وابن ماجه، وصحّحه الألباني' })
  ];

  // ── 🕌 مواقيت مكان الجوال (نظير lib/utils/prayer_times.dart — تُعدَّلان معًا):
  //    المنطقة الزمنية ⇒ مدينةٌ ممثِّلة، والفرق عن UTC من الجهاز؛ رابطة العالم
  //    الإسلاميّ (فجر 18° · عشاء 17°)، والعصر بالمثل، وسُبع الليل في العروض العالية.
  var ZONES = {
    'Asia/Gaza': [31.50, 34.47], 'Asia/Hebron': [31.53, 35.10], 'Asia/Jerusalem': [31.78, 35.22],
    'Asia/Tel_Aviv': [31.78, 35.22], 'Asia/Amman': [31.95, 35.93], 'Asia/Beirut': [33.89, 35.50],
    'Asia/Damascus': [33.51, 36.29], 'Asia/Baghdad': [33.31, 44.36], 'Asia/Riyadh': [24.71, 46.68],
    'Asia/Kuwait': [29.37, 47.98], 'Asia/Qatar': [25.29, 51.53], 'Asia/Bahrain': [26.23, 50.59],
    'Asia/Dubai': [25.20, 55.27], 'Asia/Muscat': [23.59, 58.41], 'Asia/Aden': [12.79, 45.03],
    'Asia/Tehran': [35.69, 51.39], 'Asia/Karachi': [24.86, 67.01], 'Asia/Kuala_Lumpur': [3.14, 101.69],
    'Asia/Jakarta': [-6.21, 106.85], 'Africa/Cairo': [30.04, 31.24], 'Africa/Tripoli': [32.89, 13.19],
    'Africa/Tunis': [36.81, 10.18], 'Africa/Algiers': [36.75, 3.06], 'Africa/Casablanca': [33.57, -7.59],
    'Africa/Khartoum': [15.50, 32.56], 'Africa/Nouakchott': [18.08, -15.98], 'Europe/Istanbul': [41.01, 28.98],
    'Europe/London': [51.51, -0.13], 'Europe/Dublin': [53.35, -6.26], 'Europe/Paris': [48.86, 2.35],
    'Europe/Brussels': [50.85, 4.35], 'Europe/Amsterdam': [52.37, 4.90], 'Europe/Berlin': [52.52, 13.40],
    'Europe/Vienna': [48.21, 16.37], 'Europe/Copenhagen': [55.68, 12.57], 'Europe/Oslo': [59.91, 10.75],
    'Europe/Stockholm': [59.33, 18.07], 'Europe/Rome': [41.90, 12.50], 'Europe/Madrid': [40.42, -3.70],
    'Europe/Athens': [37.98, 23.73], 'America/New_York': [40.71, -74.01], 'America/Toronto': [43.65, -79.38],
    'America/Chicago': [41.88, -87.63], 'America/Denver': [39.74, -104.99],
    'America/Los_Angeles': [34.05, -118.24], 'Australia/Sydney': [-33.87, 151.21],
    'Australia/Melbourne': [-37.81, 144.96]
  };
  function fix(a, b) { var r = a - b * Math.floor(a / b); return r < 0 ? r + b : r; }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function compute(day, lat, lng, tzH) {
    var jd = (Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(2000, 0, 1, 12)) / 864e5 +
      0.5 - lng / 360;
    var g = rad(fix(357.529 + 0.98560028 * jd, 360));
    var q = fix(280.459 + 0.98564736 * jd, 360);
    var L = rad(fix(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g), 360));
    var e = rad(23.439 - 0.00000036 * jd);
    var ra = fix(deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15, 24);
    var decl = Math.asin(Math.sin(e) * Math.sin(L));
    var la = rad(lat);
    var noon = fix(12 - (q / 15 - ra), 24) + tzH - lng / 15;
    function span(a) {
      var c = (-Math.sin(rad(a)) - Math.sin(decl) * Math.sin(la)) / (Math.cos(decl) * Math.cos(la));
      return c < -1 || c > 1 ? null : deg(Math.acos(c)) / 15;
    }
    var rise = span(0.833);
    var asr = span(-deg(Math.atan(1 / (1 + Math.tan(Math.abs(la - decl))))));
    if (rise == null || asr == null) return null;
    var night = 24 - 2 * rise;
    var fajr = span(18), isha = span(17);
    if (fajr == null) fajr = rise + night / 7;
    if (isha == null) isha = rise + night / 7;
    function m(h) { return Math.round(fix(h, 24) * 60); }
    return { fajr: m(noon - fajr), sunrise: m(noon - rise), dhuhr: m(noon) + 1, asr: m(noon + asr),
             maghrib: m(noon + rise), isha: m(noon + isha) };
  }
  var _ptKey = null, _pt = null;
  function prayers(d) {
    var zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) {}
    var off = -new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTimezoneOffset();
    var key = zone + '|' + dayKey(d) + '|' + off;
    if (key === _ptKey) return _pt;
    var c = ZONES[zone] || [31, off / 4];
    _pt = compute(d, c[0], c[1], off / 60);
    _ptKey = key;
    return _pt;
  }
  function clock(min) {
    min = fix(min, 1440);
    var h = Math.floor(min / 60);
    var per = h < 4 ? 'ليلًا' : h < 12 ? 'صباحًا' : h < 15 ? 'ظهرًا' : h < 18 ? 'عصرًا' : 'مساءً';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + pad2(min % 60) + ' ' + per;
  }

  // ── الوقت ──
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  /* نظير adhkarTimeOf: الصباح من الفجر إلى الظهر · المساء من العصر إلى منتصف الليل
     — بمواقيت مكان الجوال؛ ولا مواقيت (عروضٌ قطبية) ⇒ 4–11 و15–22 */
  function timeOf(d) {
    var p = prayers(d), n = d.getHours() * 60 + d.getMinutes();
    if (!p) {
      var h = d.getHours();
      return h >= 4 && h < 11 ? 'm' : h >= 15 && h < 22 ? 'e' : null;
    }
    if (n >= p.fajr && n < p.dhuhr) return 'm';
    if (n >= p.asr) return 'e';
    return null;
  }
  function listFor(t) { return ADHKAR.filter(function (x) { return !x.only || x.only === t; }); }
  function textFor(x, t) { return t === 'e' && x.evening ? x.evening : x.text; }
  function title(t) { return t === 'm' ? 'أذكار الصباح' : 'أذكار المساء'; }
  /* before · now · after — الجمعة وحدها، آخر ساعةٍ قبل مغرب مكان الجوال */
  function maghribOf(d) { var p = prayers(d); return p ? p.maghrib : 18 * 60; }
  function fridayHour(d) {
    if (d.getDay() !== 5) return null;
    var m = maghribOf(d), n = d.getHours() * 60 + d.getMinutes();
    if (n >= m) return 'after';
    if (n >= m - 60) return 'now';
    return 'before';
  }
  function hourLine(h, d) {
    var m = maghribOf(d || new Date());
    if (h === 'before') {
      return 'آخر ساعةٍ بعد العصر ساعةٌ تُرجى فيها الإجابة — من نحو ' + clock(m - 60) +
        ' حتى المغرب (نحو ' + clock(m) + ') بتوقيتك.';
    }
    if (h === 'now') {
      return 'الآن آخر ساعةٍ قبل المغرب (نحو ' + clock(m) + ') — ساعةٌ تُرجى فيها الإجابة؛ نسأل الله القبول.';
    }
    return 'مضت ساعة الاستجابة لهذه الجمعة؛ تقبّل الله الدعاء.';
  }

  // ── الحفظ ──
  var _user = '';
  function read() {
    var today = dayKey(new Date());
    try {
      var v = JSON.parse(localStorage.getItem('adhkar:' + _user) || 'null');
      if (v && v.d === today) return v;
    } catch (_) {}
    return { d: today };
  }
  function write(v) {
    if (!_user) return;
    try { localStorage.setItem('adhkar:' + _user, JSON.stringify(v)); } catch (_) {}
  }
  function counts(t) { return read()[t] || {}; }
  function progress(t) {
    var l = listFor(t), c = counts(t), done = 0;
    l.forEach(function (x, i) { if ((c[i] || 0) >= x.count) done++; });
    return { done: done, total: l.length };
  }
  function repaintHome() {
    if (window.QmcWelcome && QmcWelcome.repaint) { try { QmcWelcome.repaint(); } catch (_) {} }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── التنسيق ──
  function css() {
    if (document.getElementById('adkCss')) return;
    var st = document.createElement('style');
    st.id = 'adkCss';
    st.textContent =
      // 📐 (11-23) كـ.wh-card حرفيًّا (بلاغ المستخدم: «ممتدّة يسارًا وغير منسّقة») — div لا button،
      //    فبلا border-box يُضاف الحشو والإطار إلى width:100% فتخرج عن العمود
      '.adk-card{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin-top:12px;' +
      'padding:12px;border-radius:14px;border:1px solid #e0e0e0;background:#fff;text-align:start;font:inherit;' +
      'color:inherit;cursor:pointer}' +
      '.adk-card.done{border-color:rgba(27,94,32,.35)}' +
      '.adk-ic{flex:0 0 46px;height:46px;border-radius:12px;background:rgba(27,94,32,.1);color:#1B5E20;display:flex;align-items:center;justify-content:center;font-size:21px}' +
      '.adk-b{flex:1;min-width:0}.adk-h{font-size:13px;font-weight:700;color:#1B5E20}.adk-s{font-size:13.5px;line-height:1.35;margin-top:3px}' +
      '.adk-bar{height:5px;border-radius:4px;background:rgba(27,94,32,.12);margin-top:6px;overflow:hidden}' +
      '.adk-bar>i{display:block;height:100%;background:#1B5E20}' +
      '.adk-x{flex:0 0 auto;border:0;background:none;color:#999;font-size:16px;padding:4px;margin:-4px;cursor:pointer}' +
      '.adk-sala,.adk-d,.adk-hour{box-sizing:border-box}' +
      '.adk-fri{margin-top:10px;display:flex;flex-direction:column;gap:8px}' +
      '.adk-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.adk-btn{border:1px solid rgba(154,107,31,.45);background:#fff;color:#7A5A1F;border-radius:10px;padding:7px 12px;font:inherit;font-size:13.5px;cursor:pointer}' +
      '.adk-btn.on{background:rgba(27,94,32,.12);border-color:rgba(27,94,32,.4);color:#1B5E20}' +
      '.adk-sala{display:flex;align-items:center;gap:8px;width:100%;border:0;border-radius:12px;padding:10px 12px;background:rgba(27,94,32,.08);' +
      'color:#1B5E20;font:inherit;text-align:start;cursor:pointer}' +
      '.adk-sala .t{flex:1;font-family:Amiri,serif;font-size:16.5px;line-height:1.6}.adk-sala .n{font-size:20px;font-weight:800;text-align:center}' +
      '.adk-sala .n small{display:block;font-size:11px;font-weight:400;color:#666}' +
      '.adk-hour{display:flex;gap:8px;padding:8px 10px;border-radius:10px;font-size:13.5px;line-height:1.45;color:#3F2E10}' +
      '.adk-hour.now{background:#FFE8C2;border:1px solid rgba(154,107,31,.6);font-weight:700}' +
      '.adk-link{border:0;background:none;color:#9A6B1F;font:inherit;font-weight:600;padding:4px 0;cursor:pointer;text-align:start}' +
      '.adk-d{border:1px solid var(--border-color,#ddd);border-radius:14px;padding:12px 14px 10px;margin-bottom:10px;background:var(--card-bg,#fff)}' +
      '.adk-d.tap{cursor:pointer}.adk-d.ok{border-color:rgba(27,94,32,.35);background:rgba(27,94,32,.06)}' +
      '.adk-d .x{font-family:Amiri,serif;font-size:18px;line-height:1.85}.adk-d.ok .x{opacity:.6}' +
      '.adk-d .s{font-size:11.5px;color:#666;margin-top:4px}.adk-d .v{font-size:12px;line-height:1.45;color:#7A5A1F;margin-top:2px}' +
      '.adk-d .c{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12.5px;color:#666}' +
      '.adk-d .c b{margin-inline-start:auto;direction:ltr;padding:3px 10px;border-radius:20px;background:rgba(27,94,32,.1);color:#1B5E20;font-size:13px}' +
      '.adk-d.ok .c b{background:#1B5E20;color:#fff}' +
      '.adk-top{display:flex;align-items:center;gap:10px;margin:4px 0 10px}.adk-top .adk-bar{flex:1;height:8px;margin:0}' +
      '.adk-top b{color:#1B5E20;font-size:13.5px}' +
      '.adk-q{font-family:Amiri,serif;font-size:15.5px;line-height:1.7;margin:4px 0 6px}.adk-q small{font-family:inherit;font-size:11.5px;color:#666}';
    document.head.appendChild(st);
  }

  // ── بطاقة الرئيسية ──
  function homeHtml(now, user) {
    _user = user || '';
    var t = timeOf(now);
    if (!t || !_user) return '';
    var v = read();
    if ((v.hide || []).indexOf(t) !== -1) return '';
    css();
    var p = progress(t), all = p.done >= p.total;
    var sub = all ? 'اكتملت لهذا ' + (t === 'm' ? 'الصباح' : 'المساء') + '؛ تقبّل الله.'
      : p.done === 0 ? p.total + ' ذكرًا بعدّادٍ يحفظ ما قُرئ — لمسةٌ للبدء'
        : 'قُرئ ' + p.done + ' من ' + p.total + ' — لمسةٌ للإكمال';
    return '<div class="adk-card' + (all ? ' done' : '') + '" role="button" tabindex="0" data-adk="open" data-t="' + t + '">' +
      '<div class="adk-ic"><i class="fas ' + (all ? 'fa-circle-check' : t === 'm' ? 'fa-sun' : 'fa-moon') + '"></i></div>' +
      '<div class="adk-b"><div class="adk-h">' + title(t) + '</div><div class="adk-s">' + esc(sub) + '</div>' +
      (!all && p.done > 0 ? '<div class="adk-bar"><i style="width:' + Math.round(100 * p.done / p.total) + '%"></i></div>' : '') +
      '</div><button type="button" class="adk-x" data-adk="hide" data-t="' + t + '" title="إخفاء لهذا اليوم" aria-label="إخفاء لهذا اليوم">' +
      '<i class="fas fa-xmark"></i></button></div>';
  }

  /* 🕌 بنود الجمعة داخل بطاقة المناسبة */
  function fridayHtml(now, user) {
    _user = user || '';
    if (now.getDay() !== 5 || !_user) return '';
    css();
    var v = read(), h = fridayHour(now) || 'before';
    return '<div class="adk-fri">' +
      '<div class="adk-row">' +
      '<button type="button" class="adk-btn" data-adk="kahf"><i class="fas fa-book-quran"></i> سورة الكهف في المصحف</button>' +
      '<button type="button" class="adk-btn' + (v.kahf ? ' on' : '') + '" data-adk="kahfread">' +
      (v.kahf ? '<i class="fas fa-check"></i> قُرئت هذه الجمعة' : 'تمّت قراءتها؟') + '</button></div>' +
      salaHtml(v) +
      '<div class="adk-hour' + (h === 'now' ? ' now' : '') + '"><i class="fas fa-hands-praying" style="color:#9A6B1F;margin-top:3px"></i>' +
      '<span>' + esc(hourLine(h, now)) + '</span></div>' +
      '<button type="button" class="adk-link" data-adk="friday"><i class="fas fa-chevron-left"></i> أدعية الجمعة والصلاة الإبراهيمية</button>' +
      '</div>';
  }

  function salaHtml(v) {
    return '<button type="button" class="adk-sala" data-adk="sala"><span class="t">' + SALAWAT_SHORT + ' ﷺ</span>' +
      '<span class="n">' + (v.sala || 0) + '<small>اليوم</small></span></button>';
  }

  // ── الشاشات (نوافذ) ──
  function overlay(id, inner) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box" style="max-height:88vh;overflow:auto;text-align:start;width:min(640px,96vw)">' + inner + '</div>';
    o.addEventListener('click', function (ev) {
      if (ev.target === o || ev.target.closest('[data-close]')) { o.remove(); repaintHome(); return; }
      onClick(ev);
    });
    document.body.appendChild(o);
    return o;
  }

  function dhikrHtml(x, text, i, n, tap) {
    var ok = tap && n >= x.count;
    var h = '<div class="adk-d' + (tap ? ' tap' : '') + (ok ? ' ok' : '') + '"' +
      (tap ? ' data-adk="count" data-i="' + i + '"' : '') + '>' +
      '<div class="x">' + esc(text) + '</div><div class="s">' + esc(x.source) + '</div>' +
      (x.virtue ? '<div class="v">' + esc(x.virtue) + '</div>' : '');
    if (tap) {
      h += '<div class="c">' + (ok ? '<i class="fas fa-circle-check" style="color:#1B5E20"></i> تمّ'
        : '<i class="fas fa-hand-pointer"></i> ' + (x.count === 1 ? 'لمسةٌ بعد قراءته' : 'كل لمسةٍ مرّة')) +
        '<b>' + (x.count === 1 ? (ok ? '✓' : 'مرّة') : Math.min(n, x.count) + ' / ' + x.count) + '</b></div>';
    }
    return h + '</div>';
  }

  var _openT = null;
  function openAdhkar(t) {
    _openT = t;
    var l = listFor(t), c = counts(t), p = progress(t), all = p.done >= p.total;
    var h = '<h4 class="modal-title">' + title(t) + '</h4>' +
      '<div class="adk-top"><div class="adk-bar"><i style="width:' + Math.round(100 * p.done / p.total) + '%"></i></div>' +
      '<b>' + (all ? 'اكتملت ✓' : p.done + ' من ' + p.total) + '</b></div>' +
      (all ? '<p style="color:#1B5E20;font-size:13.5px;margin:0 0 8px">تقبّل الله منّا ومنكم، وحفظكم في ' +
        (t === 'm' ? 'يومكم' : 'ليلتكم') + '.</p>' : '');
    l.forEach(function (x, i) { h += dhikrHtml(x, textFor(x, t), i, c[i] || 0, true); });
    h += '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-adk="reset">إعادة العدّ</button>' +
      '<button type="button" class="modal-btn modal-confirm" data-close>إغلاق</button></div>';
    var box = document.querySelector('#adkModal .modal-box');
    var top = box ? box.scrollTop : 0;
    var o = overlay('adkModal', h);
    o.querySelector('.modal-box').scrollTop = top;
  }

  function openFriday() {
    var v = read(), hr = fridayHour(new Date()) || 'before';
    function q(a) { return '<div class="adk-q">' + esc(a[0]) + ' <small>— ' + esc(a[1]) + '</small></div>'; }
    var h = '<h4 class="modal-title">يوم الجمعة</h4>' +
      '<div class="adk-fri" style="margin:0 0 8px">' +
      '<div class="adk-row"><button type="button" class="adk-btn" data-adk="kahf"><i class="fas fa-book-quran"></i> سورة الكهف في المصحف</button>' +
      '<button type="button" class="adk-btn' + (v.kahf ? ' on' : '') + '" data-adk="kahfread">' +
      (v.kahf ? '<i class="fas fa-check"></i> قُرئت هذه الجمعة' : 'تمّت قراءتها؟') + '</button></div>' +
      salaHtml(v) + '</div>' +
      dhikrHtml(IBRAHIMIYYA, IBRAHIMIYYA.text, 0, 0, false) + q(HADITH.sala) + q(HADITH.salaV) +
      '<h5 style="color:#9A6B1F;margin:14px 0 4px"><i class="fas fa-hands-praying"></i> ساعة الاستجابة</h5>' +
      '<div class="adk-hour' + (hr === 'now' ? ' now' : '') + '" style="padding:0' + (hr === 'now' ? ' 10px' : '') + '">' +
      esc(hourLine(hr)) + '</div>' + q(HADITH.hour);
    DUAS.forEach(function (x) { h += dhikrHtml(x, x.text, 0, 0, false); });
    h += '<div class="modal-actions"><button type="button" class="modal-btn modal-confirm" data-close>إغلاق</button></div>';
    var box = document.querySelector('#adkFriModal .modal-box');
    var top = box ? box.scrollTop : 0;
    var o = overlay('adkFriModal', h);
    o.querySelector('.modal-box').scrollTop = top;
  }

  // ── التفاعل (الرئيسية والنوافذ) ──
  function onClick(e) {
    var el = e.target.closest('[data-adk]');
    if (!el) return;
    e.stopPropagation();
    var a = el.dataset.adk, v;
    var inFri = !!el.closest('#adkFriModal');
    if (a === 'open') openAdhkar(el.dataset.t);
    else if (a === 'hide') {
      v = read();
      v.hide = (v.hide || []).concat([el.dataset.t]);
      write(v); repaintHome();
    } else if (a === 'count') {
      var t = _openT, i = Number(el.dataset.i), x = listFor(t)[i];
      v = read();
      var c = v[t] || {};
      if ((c[i] || 0) >= x.count) return;
      c[i] = (c[i] || 0) + 1;
      v[t] = c; write(v);
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
      openAdhkar(t);
    } else if (a === 'reset') {
      if (!confirm('يُصفَّر عدّ ' + title(_openT) + ' لهذا اليوم.')) return;
      v = read(); delete v[_openT]; write(v); openAdhkar(_openT);
    } else if (a === 'kahf') {
      if (typeof window.openMushafAt === 'function') window.openMushafAt(KAHF_PAGE);
    } else if (a === 'kahfread') {
      v = read(); v.kahf = !v.kahf; write(v);
      if (inFri) openFriday(); else repaintHome();
    } else if (a === 'sala') {
      v = read(); v.sala = (v.sala || 0) + 1; write(v);
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
      if (inFri) openFriday(); else repaintHome();
    } else if (a === 'friday') openFriday();
  }

  document.addEventListener('click', function (e) {
    // النوافذ تُعالج نقرها بنفسها (overlay) — هنا الرئيسية وحدها
    if (e.target.closest('.modal-overlay')) return;
    if (e.target.closest('#homeRoot')) onClick(e);
  });

  window.QmcAdhkar = {
    homeHtml: homeHtml,
    fridayHtml: fridayHtml,
    fridayHour: fridayHour,
    _timeOf: timeOf,
    _listFor: listFor
  };
})();
