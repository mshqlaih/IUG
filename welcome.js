/* 🏠 الرئيسية (2026-11-09) — نظير lib/screens/welcome_home_screen.dart و
 * lib/models/welcome_messages.dart و lib/services/welcome_service.dart.
 *
 * أوّل ما يراه كل مستخدم: شعار مؤسسته واسمها وآيتها، وتحيةٌ برسالةٍ تناسب
 * وقته (بساعة جهازه حيث هو) ودوره، ثم «مواعيدي»، ثم اختصاراتٌ إلى تبويباته،
 * ثم «يحتاج تدخّلك» لمن له بطاقات.
 *
 * النقاط (كلّها موجودة لأندرويد، والتوكن X-Device-Id يحقنه QMC.apiFetch):
 *   GET  org/welcome            ⇒ آية المؤسسة ونوع الرسائل (QMC_WELCOME_PKG)
 *   POST org/welcome            ⇒ SAVE/RESET لمدير المؤسسة (can_edit)
 *   GET  org/branding?ver=      ⇒ اسم الجذر وشعاره (logo_b64 إن تغيّرت النسخة)
 *   GET  org/agenda?date_from=&date_to= ⇒ events · derived · group (للعرض وحده)
 *   GET  org/insights           ⇒ بطاقات «يحتاج تدخّلك»
 *
 * ⚠️ الرسالة تُختار بالتاريخ×الفترة×الدور ببصمة FNV نفسها في Dart (pickIndex)
 *    ⇒ الرسالة نفسها على الآيفون وأندرويد في الفترة نفسها. أيّ تغييرٍ في
 *    welcome_messages.dart (العبارات · الآيات · ترتيبها) يُنقل هنا كما هو.
 * ⚠️ صياغةٌ محايدة: لا أفعال أمرٍ للمخاطَب ولا صفاتٍ مذكّرة.
 *
 * التخزين (localStorage، مفاتيح مختومة بالمستخدم فلا تُمحى عند الخروج):
 *   welcome:<user> · org_brand:<user> · agenda_glance:<user> · insights:<user>
 *   tab_use:<user> · tab_last:<user> · welcome_seen:<user>
 */
(function () {
  'use strict';

  // ── الفترات والأدوار ──
  function periodOf(d) {
    var h = d.getHours();
    if (h >= 4 && h < 11) return 'morning';
    if (h >= 11 && h < 15) return 'noon';
    if (h >= 15 && h < 18) return 'asr';
    if (h >= 18 && h < 22) return 'evening';
    return 'night';
  }

  var GREET = {
    morning: 'صباح الخير', noon: 'طاب يومك', asr: 'طابت أوقاتك',
    evening: 'مساء الخير', night: 'أهلًا بك'
  };
  var PERIOD_ICON = {
    morning: 'fa-sun', noon: 'fa-cloud-sun', asr: 'fa-cloud-sun',
    evening: 'fa-moon', night: 'fa-bed'
  };
  // ألوان السماء في كل فترة — والنصّ فوقها أبيض
  var SKY = {
    morning: ['#D99550', '#2E8670'],
    noon: ['#2F7FA8', '#1F6B55'],
    asr: ['#C67A3F', '#7A4B33'],
    evening: ['#5E4785', '#26365F'],
    night: ['#1E2747', '#0A0F1E']
  };
  var ROLE_TITLE = {
    manager: 'الإدارة', supervisor: 'الإشراف', teacher: 'معلّم الحلقة', muqri: 'الإقراء'
  };

  // ── عبارات التحفيز: فترة × دور (نسخة welcomeLines) ──
  var LINES = {
    morning: {
      manager: [
        'بداية يومٍ مباركة؛ نظرةٌ سريعة على ما يحتاج تدخّلك تكفي للاطمئنان على المراكز.',
        'صباحٌ جديد وحلقاتٌ عامرة بإذن الله، يسّر الله لك يومك.',
        'كل حلقةٍ تُفتح اليوم ثمرةُ جهدٍ إداريّ لا يراه كثيرون؛ بارك الله فيه.'
      ],
      supervisor: [
        'صباحٌ مبارك؛ زيارةٌ واحدة اليوم قد تصنع فرقًا في حلقةٍ كاملة.',
        'يومٌ جديد للمتابعة والتشجيع، وفّقك الله.',
        'المتابعة الهادئة سرّ الحلقة الناجحة؛ صباحٌ مبارك.'
      ],
      teacher: [
        'طلابك على موعدٍ مع القرآن اليوم، وأثرك فيهم يبقى.',
        'بارك الله في صباحك وفي حلقتك.',
        'كل آيةٍ يحفظها طالبٌ اليوم في ميزانك بإذن الله.'
      ],
      muqri: [
        'مجلس الإقراء أمانةُ السند؛ صباحٌ مبارك.',
        'يسّر الله مجالس اليوم، وبارك في القارئين.',
        'بك يتّصل السند جيلًا بعد جيل؛ صباحٌ مبارك.'
      ]
    },
    noon: {
      manager: [
        'منتصف اليوم: استراحةٌ قصيرة ثم يُستأنف العمل.',
        'خدمة القرآن عبادةٌ في كل ساعة، تقبّل الله منك.',
        'نصف النهار مضى بخير، وما بقي أيسر بإذن الله.'
      ],
      supervisor: [
        'نصف اليوم مضى؛ ما بقي من المتابعة تجده أسفل الصفحة.',
        'استراحةٌ قصيرة تجدّد الهمّة لما بقي من الزيارات.',
        'العمل المتّصل وإن قلّ أحبّ إلى الله؛ أعانك الله.'
      ],
      teacher: [
        'استعدادٌ هادئ للحلقة يجعلها أيسر.',
        'تعليم القرآن من خير الأعمال؛ تقبّل الله منك.',
        'وقتٌ مناسب لمراجعة خطة طلاب اليوم.'
      ],
      muqri: [
        'استراحةٌ قصيرة قبل مجالس اليوم.',
        'نيّةٌ متجدّدة تُبارك المجلس؛ أعانك الله.',
        'نصف اليوم مضى؛ مواعيد ما بعده تجدها هنا.'
      ]
    },
    asr: {
      manager: [
        'ساعات الحلقات عصرًا ومغربًا؛ المراكز عامرةٌ بأصوات القرآن.',
        'ما يطرأ في حلقات اليوم تجده هنا.',
        'في حلقات اليوم تُتلى آياتٌ كثيرة في مراكزك؛ الحمد لله.'
      ],
      supervisor: [
        'زيارةٌ ميدانية في وقت الحلقة تصنع فرقًا؛ وفّقك الله.',
        'زيارةٌ في وقت الحلقة تُغني عن تقارير كثيرة.',
        'أطيب الزيارات ما كانت تشجيعًا قبل أن تكون تقييمًا.'
      ],
      teacher: [
        'طلابك على موعدٍ معك في الحلقة؛ يسّر الله لكم.',
        'وقت الحلقة؛ يسّر الله لك ولطلابك.',
        'كلمةٌ طيّبة لطالبٍ متعثّر قد تغيّر يومه كلّه.'
      ],
      muqri: [
        'يسّر الله مجالس اليوم وبارك فيها.',
        'وقت الإقراء؛ بارك الله في المجلس.',
        'التلاوة المتقنة تبدأ من مجلسٍ هادئ؛ أعانك الله.'
      ]
    },
    evening: {
      manager: [
        'ما يُدخَل من نشاط اليوم محفوظ؛ شكر الله سعيك.',
        'يومٌ عامر بالحلقات، وما بقي يمكن أن ينتظر الغد.',
        'يومٌ آخر في خدمة القرآن؛ تقبّل الله منك.'
      ],
      supervisor: [
        'تقارير زيارات اليوم: ما بقي منها تجده أسفل الصفحة.',
        'شكر الله سعيك في متابعة الحلقات اليوم.',
        'يومٌ من المتابعة مضى بخير؛ تقبّل الله منك.'
      ],
      teacher: [
        'نشاط اليوم: إن بقي منه شيءٌ لم يُدخَل تجده هنا.',
        'حلقة اليوم في ميزانك بإذن الله؛ تقبّل الله منك.',
        'ما حفظه طلابك اليوم صدقةٌ جارية لك بإذن الله.'
      ],
      muqri: [
        'تقبّل الله مجالس اليوم.',
        'تلاوات اليوم: ما بقي منها تجده هنا.',
        'مجلسٌ آخر في حفظ السند؛ بارك الله فيك.'
      ]
    },
    night: {
      manager: [
        'تأخّر الوقت؛ راحتك جزءٌ من العمل، والغد يحتاجك.',
        'عملٌ في ساعةٍ متأخّرة؛ أعانك الله.',
        'ما بقي يُكمَل غدًا بإذن الله؛ ليلةٌ هانئة.'
      ],
      supervisor: [
        'تأخّر الوقت؛ راحتك جزءٌ من العمل.',
        'أعانك الله؛ ما بقي يُكمَل غدًا.',
        'ليلةٌ هانئة، وغدٌ مبارك بإذن الله.'
      ],
      teacher: [
        'تأخّر الوقت؛ الراحة تعين على حلقة الغد.',
        'أعانك الله، والسهر الطويل يُتعب الغد.',
        'ليلةٌ هانئة، وحلقةٌ مباركة غدًا بإذن الله.'
      ],
      muqri: [
        'تأخّر الوقت؛ نومٌ هانئ يعين على مجالس الغد.',
        'أعانك الله، وما بقي يُكمَل غدًا.',
        'ليلةٌ هانئة، ومجالسُ مباركة غدًا بإذن الله.'
      ]
    }
  };

  // ── الآيات والأحاديث (نسخة welcome_messages.dart بالترتيب نفسه) ──
  function Q(t, s) { return { text: t, source: s }; }
  var _bukur = Q('«اللهمّ بارك لأمّتي في بُكورها»', 'رواه أبو داود والترمذي وحسّنه');
  var _adwamuha = Q('«أحبُّ الأعمال إلى الله أدومُها وإن قلّ»', 'متّفق عليه');
  var _khairukum = Q('«خيرُكم مَن تعلّم القرآن وعلّمه»', 'رواه البخاري');
  var _maher = Q('«الماهرُ بالقرآن مع السَّفَرة الكرام البَرَرة»', 'رواه مسلم');
  var _shafia = Q('«اقرؤوا القرآن؛ فإنّه يأتي يوم القيامة شفيعًا لأصحابه»', 'رواه مسلم');
  var _talab = Q('«مَن سلك طريقًا يلتمس فيه علمًا سهّل الله له به طريقًا إلى الجنّة»', 'رواه مسلم');
  var _harf = Q('«مَن قرأ حرفًا من كتاب الله فله به حسنة، والحسنةُ بعشر أمثالها»', 'رواه الترمذي وصحّحه');
  var _muallim = Q('«إنّ الله وملائكته وأهلَ السماوات والأرض، حتى النملةَ في جُحرها وحتى الحوت، ' +
    'ليصلّون على معلّم الناس الخير»', 'رواه الترمذي وصحّحه');
  var _dal = Q('«الدالُّ على الخير كفاعله»', 'رواه الترمذي');
  var _ahl = Q('«أهلُ القرآن هم أهلُ الله وخاصّته»', 'رواه ابن ماجه وأحمد، وصحّحه الألباني');
  var _nuzul = Q('«ينزل ربُّنا تبارك وتعالى كلَّ ليلةٍ إلى السماء الدنيا حين يبقى ثلثُ الليل الآخر»', 'متّفق عليه');
  var _zidni = Q('﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾', 'طه: 114');
  var _fajr = Q('﴿إِنَّ قُرْآنَ الْفَجْرِ كَانَ مَشْهُودًا﴾', 'الإسراء: 78');
  var _iamalu = Q('﴿وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ﴾', 'التوبة: 105');
  var _tawfiqi = Q('﴿وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ﴾', 'هود: 88');
  var _yassarna = Q('﴿وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ﴾', 'القمر: 17');
  var _sabbih = Q('﴿وَسَبِّحْ بِحَمْدِ رَبِّكَ قَبْلَ طُلُوعِ الشَّمْسِ وَقَبْلَ الْغُرُوبِ﴾', 'ق: 39');
  var _nudiu = Q('﴿إِنَّا لَا نُضِيعُ أَجْرَ مَنْ أَحْسَنَ عَمَلًا﴾', 'الكهف: 30');
  var _jahadu = Q('﴿وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا﴾', 'العنكبوت: 69');
  var _yaddabbaru = Q('﴿كِتَابٌ أَنزَلْنَاهُ إِلَيْكَ مُبَارَكٌ لِّيَدَّبَّرُوا آيَاتِهِ﴾', 'ص: 29');
  var _aqwam = Q('﴿إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ﴾', 'الإسراء: 9');
  var _subata = Q('﴿وَجَعَلْنَا نَوْمَكُمْ سُبَاتًا﴾', 'النبأ: 9');
  var _fansab = Q('﴿فَإِذَا فَرَغْتَ فَانصَبْ﴾', 'الشرح: 7');
  var _rattil = Q('﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾', 'المزمل: 4');

  var PERIOD_QUOTES = {
    morning: [_bukur, _fajr, _zidni, _talab],
    noon: [_adwamuha, _iamalu, _tawfiqi, _harf],
    asr: [_khairukum, _yassarna, _sabbih, _shafia],
    evening: [_nudiu, _jahadu, _yaddabbaru, _aqwam],
    night: [_subata, _nuzul, _fansab]
  };
  var ROLE_QUOTES = {
    manager: [_dal, _ahl],
    supervisor: [_dal, _iamalu],
    teacher: [_khairukum, _muallim],
    muqri: [_maher, _rattil]
  };

  // ── التقويم ──
  var AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var HIJRI_MONTHS = ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
    'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجّة'];

  // تقويم أمّ القرى من المتصفح — null حيث لا يدعمه (iOS قديم)
  var _hijriFmt;
  function hijriOf(d) {
    try {
      if (_hijriFmt === undefined) {
        _hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',
          { day: 'numeric', month: 'numeric', year: 'numeric' });
        if (_hijriFmt.resolvedOptions().calendar !== 'islamic-umalqura') _hijriFmt = null;
      }
      if (!_hijriFmt) return null;
      var p = {};
      _hijriFmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      var r = { d: parseInt(p.day, 10), m: parseInt(p.month, 10), y: parseInt(p.year, 10) };
      return (r.d && r.m && r.y) ? r : null;
    } catch (_) { _hijriFmt = null; return null; }
  }

  function gregorianLabel(d) {
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()];
  }
  function hijriLabel(d) {
    var h = hijriOf(d);
    return h ? h.d + ' ' + HIJRI_MONTHS[h.m - 1] + ' ' + h.y + ' هـ' : null;
  }

  /* مناسبة اليوم — الأقوى أوّلًا (نسخة occasionOf) */
  function occasionOf(d) {
    var h = hijriOf(d);
    if (h) {
      var m = h.m, day = h.d;
      if ((m === 10 && day <= 3) || (m === 12 && day >= 10 && day <= 13)) {
        return { key: 'eid', greeting: 'عيدٌ مبارك', title: 'عيدٌ مبارك',
          line: 'تقبّل الله منّا ومنكم، وكلّ عامٍ وأنتم بخير.' };
      }
      if (m === 12 && day === 9) {
        return { key: 'arafah', title: 'يوم عرفة',
          line: 'خير يومٍ طلعت فيه الشمس من أيام العام؛ تقبّل الله منّا ومنكم.',
          quote: Q('«صيامُ يوم عرفة أحتسبُ على الله أن يكفّر السنة التي قبله والسنة التي بعده»', 'رواه مسلم') };
      }
      if (m === 12 && day <= 8) {
        return { key: 'dhul_hijjah', title: 'عشر ذي الحجّة',
          line: 'أيامٌ العملُ الصالح فيها أحبّ إلى الله؛ بارك الله في أيامك.',
          quote: Q('«ما من أيامٍ العملُ الصالح فيهنّ أحبُّ إلى الله من هذه الأيام العشر»', 'رواه أبو داود، وأصله في البخاري') };
      }
      if (m === 9) {
        return { key: 'ramadan', greeting: 'رمضان كريم', title: 'رمضان مبارك',
          line: 'شهر القرآن؛ أعان الله على صيامه وقيامه وتلاوته.',
          quote: Q('﴿شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ﴾', 'البقرة: 185') };
      }
      if (m === 1 && day <= 3) {
        return { key: 'hijri_new_year', title: 'عامٌ هجريّ مبارك',
          line: 'أعاده الله علينا وعليكم بالخير، وجعله عام قرآنٍ وبركة.' };
      }
    }
    if (d.getDay() === 5) {
      return { key: 'friday', title: 'جمعةٌ مباركة',
        line: 'يومٌ مبارك؛ سورة الكهف والإكثار من الصلاة على النبيّ ﷺ.',
        quote: Q('«مَن قرأ سورة الكهف في يوم الجمعة أضاء له من النور ما بين الجمعتين»', 'رواه الحاكم والبيهقي، وصحّحه الألباني') };
    }
    return null;
  }
  var OCC_ICON = { friday: 'fa-book-open', ramadan: 'fa-moon', eid: 'fa-gift' };

  /* اختيارٌ ثابت لليوم والفترة والدور — FNV-1a 32 بتًّا كـpickIndex في Dart */
  function pickIndex(key, length) {
    if (length <= 1) return 0;
    var h = 0x811c9dc5;
    for (var i = 0; i < key.length; i++) {
      h = (h ^ key.charCodeAt(i)) >>> 0;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % length;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function messageFor(now, role, withQuote) {
    var p = periodOf(now);
    var key = dayKey(now) + '|' + p + '|' + role;
    var lines = LINES[p][role];
    var line = lines[pickIndex(key, lines.length)];
    if (!withQuote) return { line: line, quote: null };
    var pool = PERIOD_QUOTES[p].concat(ROLE_QUOTES[role]);
    return { line: line, quote: pool[pickIndex(key + '|q', pool.length)] };
  }

  /* «عبد الله» و«أبو بكر» و«نور الدين» كلمتان لا كلمة */
  function firstNameOf(full) {
    var parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length > 1) {
      var always = ['عبد', 'أبو', 'ابو', 'أم', 'ام'];
      var beforeAl = ['نور', 'سيف', 'شمس', 'عز', 'علاء', 'بهاء', 'صلاح', 'جمال'];
      if (always.indexOf(parts[0]) !== -1 ||
          (beforeAl.indexOf(parts[0]) !== -1 && parts[1].indexOf('ال') === 0)) {
        return parts[0] + ' ' + parts[1];
      }
    }
    return parts[0];
  }

  // «12:00 ظهرًا» (ApptClock.clock)
  function clock(min) {
    var h = Math.floor(min / 60) % 24;
    var per = h < 4 ? 'ليلًا' : h < 12 ? 'صباحًا' : h < 15 ? 'ظهرًا' : h < 18 ? 'عصرًا' : 'مساءً';
    return (h % 12 === 0 ? 12 : h % 12) + ':' + pad2(min % 60) + ' ' + per;
  }

  /* ⏰ سطر معلّم الحلقة من موعد حلقته الفعليّ (نسخة circleLineFor) */
  function circleLineFor(today, nowMin) {
    if (!today.length) return null;
    function after(m) {
      if (m < 1) return 'الآن';
      if (m === 1) return 'بعد دقيقة';
      if (m === 2) return 'بعد دقيقتين';
      if (m <= 10) return 'بعد ' + m + ' دقائق';
      if (m < 60) return 'بعد ' + m + ' دقيقة';
      if (m < 75) return 'بعد ساعة';
      if (m < 105) return 'بعد ساعةٍ ونصف';
      if (m < 150) return 'بعد ساعتين';
      return '';
    }
    var timed = today.filter(function (c) { return c.start != null; });
    var on = timed.filter(function (c) {
      return c.start <= nowMin && nowMin < (c.end != null ? c.end : c.start + 120);
    });
    if (on.length) {
      var c0 = on[0];
      return c0.end == null
        ? c0.title + ' منعقدةٌ الآن؛ يسّر الله لك ولطلابك.'
        : c0.title + ' منعقدةٌ الآن حتى ' + clock(c0.end) + '؛ يسّر الله لك ولطلابك.';
    }
    var next = timed.filter(function (c) { return c.start > nowMin; });
    if (next.length) {
      var c1 = next[0], a = after(c1.start - nowMin);
      return c1.title + ' اليوم الساعة ' + clock(c1.start) + (a ? ' — ' + a : '') + '؛ طلابك على موعدٍ معك.';
    }
    var byPrayer = today.filter(function (c) { return c.start == null && c.prayer; });
    if (byPrayer.length) {
      return byPrayer[0].title + ' اليوم ' + byPrayer[0].prayer + '؛ يسّر الله لك ولطلابك.';
    }
    if (timed.length) {
      return timed[timed.length - 1].title + ' انتهت لليوم؛ تقبّل الله منك، ' +
        'وما بقي من نشاطها يُدخَل متى تيسّر.';
    }
    return null;
  }

  // ── أدوات ──
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function user() {
    try { return typeof getCurrentUser === 'function' ? String(getCurrentUser()) : String(localStorage.getItem('user_name') || ''); }
    catch (_) { return ''; }
  }
  function lsGet(k) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
  }
  function access() {
    try { return (typeof USER_ACCESS !== 'undefined' && USER_ACCESS) || null; } catch (_) { return null; }
  }
  function s(v) {
    var t = v == null ? '' : String(v).trim();
    return (t === '' || t === 'null') ? null : t;
  }
  async function getJson(path, timeoutMs) {
    var r = await QMC.apiFetch(path, { timeoutMs: timeoutMs || 20000 });
    var d = await r.json().catch(function () { return null; });
    if (!d || d.status !== 'success') {
      throw new Error((d && d.message) || ('HTTP ' + r.status));
    }
    return d;
  }

  // ── من هو (نسخة _role) ──
  function caps() {
    var a = access();
    var v = a && a.capabilities;
    if (!Array.isArray(v)) return null;
    return v.map(function (x) { return String(x).trim().toUpperCase(); });
  }
  function roleStr() {
    var a = access();
    return String((a && a.role_name) || '').toLowerCase();
  }
  function cap(code) { var c = caps(); return c ? c.indexOf(code) !== -1 : null; }
  function canManageOrg() {
    var c = cap('CENTER_MANAGE');
    if (c !== null) return c;
    var r = roleStr();
    return r.indexOf('administrator') !== -1 || r.indexOf('programmer') !== -1 || r.indexOf('super_admin') !== -1;
  }
  function canManageCircles() {
    var c = cap('CIRCLES_MANAGE');
    if (c !== null) return c;
    var r = roleStr();
    return ['contributor', 'administrator', 'memo_supervisor', 'programmer', 'super_admin']
      .some(function (k) { return r.indexOf(k) !== -1; });
  }
  function screensList() {
    try { return typeof allowedScreens === 'function' ? allowedScreens() : []; } catch (_) { return []; }
  }
  function roleOf() {
    var r = roleStr();
    if (canManageOrg() || r.indexOf('administrator') !== -1 || r.indexOf('contributor') !== -1) return 'manager';
    if (canManageCircles() || cap('FIELD_VISIT') === true) return 'supervisor';
    var sc = screensList();
    if (sc.indexOf('iqra') !== -1 && sc.indexOf('activity') === -1) return 'muqri';
    return 'teacher';
  }

  // ── الحالة ──
  var state = {
    now: new Date(),
    compact: null,          // يُحسب في أوّل رسم بعد معرفة المستخدم
    compactUser: null,
    welcome: null,          // إعداد المؤسسة
    canEdit: false,         // للمستخدم وحده — من آخر ردٍّ في الجلسة
    brand: null,            // { root, name, ver, b64 }
    agenda: null,           // { at, from, to, events, derived, group }
    insights: null,         // { at, data }
    insightsErr: null,
    insightsBusy: false,
    open: {},               // بطاقات «يحتاج تدخّلك» المفتوحة
    fetched: {},            // ما جُلب في هذه الجلسة: welcome · brand · agenda · insights (وقته)
    user: null
  };

  var DEF_MOTTO = 'ثُمَّ أَوْرَثْنَا الْكِتَابَ الَّذِينَ اصْطَفَيْنَا مِنْ عِبَادِنَا';
  var DEF_SRC = 'فاطر: 32';

  function parseWelcome(j) {
    var motto = s(j.motto) || '';
    return {
      root_no: s(j.root_no),
      root_name: s(j.root_name),
      motto: motto,
      motto_src: s(j.motto_src) || '',
      show_motto: j.show_motto !== 'N' && motto !== '',
      quote_mode: s(j.quote_mode) || 'BOTH',
      custom: j.custom === 'Y',
      motto_def: s(j.motto_def) || DEF_MOTTO,
      src_def: s(j.src_def) || DEF_SRC
    };
  }
  function welcomeNow() {
    return state.welcome || {
      root_no: null, root_name: null, motto: DEF_MOTTO, motto_src: DEF_SRC, show_motto: true,
      quote_mode: 'BOTH', custom: false, motto_def: DEF_MOTTO, src_def: DEF_SRC
    };
  }

  /* المستخدم تغيّر (خروجٌ ودخول بلا إعادة تحميل) ⇒ تُقرأ نسخته هو */
  function syncUser() {
    var u = user();
    if (u === state.user) return u;
    state.user = u;
    state.welcome = lsGet('welcome:' + u);
    state.brand = lsGet('org_brand:' + u);
    state.agenda = lsGet('agenda_glance:' + u);
    state.insights = lsGet('insights:' + u);
    state.canEdit = false;
    state.fetched = {};
    state.compact = null;
    state.open = {};
    return u;
  }

  /* أوّل فتحٍ في هذه الفترة من اليوم ⇒ التحية كاملة، وما بعده مصغّرة */
  function firstInPeriod(u, key) {
    if (!u) return true;
    try {
      var k = 'welcome_seen:' + u;
      var first = localStorage.getItem(k) !== key;
      if (first) localStorage.setItem(k, key);
      return first;
    } catch (_) { return true; }
  }

  // ── استعمال التبويبات ──
  function tabUse(u) { return lsGet('tab_use:' + u) || {}; }
  function noteTab(tabId) {
    var u = user();
    if (!u || !tabId || tabId === 'homeTab') return;
    var m = tabUse(u);
    m[tabId] = (m[tabId] || 0) + 1;
    lsSet('tab_use:' + u, m);
    try { localStorage.setItem('tab_last:' + u, tabId); } catch (_) {}
  }

  // ── الجلب (صامتٌ عند الفشل: يبقى المحفوظ) ──
  async function fetchWelcome() {
    var d = await getJson('org/welcome');
    state.welcome = parseWelcome(d);
    state.canEdit = d.can_edit === 'Y';
    lsSet('welcome:' + state.user, state.welcome);
  }

  async function fetchBrand() {
    var have = state.brand && state.brand.ver != null ? state.brand.ver : -1;
    var d = await getJson('org/branding?ver=' + encodeURIComponent(have));
    var root = s(d.root_center_no);
    if (!root) { state.brand = null; lsSet('org_brand:' + state.user, null); return; }
    var ver = parseInt(d.logo_ver, 10) || 0;
    var has = d.has_logo === 'Y';
    var prev = state.brand && String(state.brand.root) === root ? state.brand : null;
    // النسخة المُرسَلة كانت لجذرٍ آخر فتطابقت مصادفةً ⇒ نطلب الصورة صراحةً
    if (has && d.logo_b64 == null && (!prev || !prev.b64 || prev.ver !== ver)) {
      d = await getJson('org/branding?ver=-1');
    }
    var b64 = !has ? null : (typeof d.logo_b64 === 'string' ? d.logo_b64 : (prev && prev.b64) || null);
    state.brand = { root: root, name: s(d.root_name) || '', ver: ver, b64: b64 };
    lsSet('org_brand:' + state.user, state.brand);
  }

  async function fetchAgenda() {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var end = new Date(t); end.setDate(end.getDate() + 14);
    var d = await getJson('org/agenda?date_from=' + dayKey(t) + '&date_to=' + dayKey(end), 25000);
    state.agenda = {
      at: Date.now(), from: dayKey(t), to: dayKey(end),
      events: Array.isArray(d.events) ? d.events : [],
      derived: Array.isArray(d.derived) ? d.derived : [],
      group: Array.isArray(d.group) ? d.group : []
    };
    lsSet('agenda_glance:' + state.user, state.agenda);
  }

  async function fetchInsights() {
    state.insightsBusy = true;
    paintInsights();
    try {
      var d = await getJson('org/insights', 30000);
      state.insights = { at: Date.now(), data: d };
      state.insightsErr = null;
      lsSet('insights:' + state.user, state.insights);
    } catch (e) {
      state.insightsErr = navigator.onLine ? 'تعذّر تحديث البطاقات' : null;
    } finally {
      state.insightsBusy = false;
    }
  }

  // ── 👥 حلقةٌ بلا طلاب (T_EMPTY، 2026-11-10) — نظير EmptyCircleInvite ──
  //    حلقةٌ بلا طلاب لا فائدة منها ⇒ أوّل ما يراه معلّمها دعوةٌ كبيرة تحت
  //    التحية، والإضافة تُفتح وحدها مرّةً لكل حلقة (مفتاح أندرويد نفسه).
  function emptyCard() {
    var d = state.insights && state.insights.data;
    var cards = d && Array.isArray(d.cards) ? d.cards : [];
    for (var i = 0; i < cards.length; i++) if (cards[i].code === 'T_EMPTY') return cards[i];
    return null;
  }
  function emptyCircles() {
    var c = emptyCard();
    return (c && Array.isArray(c.items) ? c.items : []).filter(function (it) { return it.circle_no != null; });
  }
  function inviteHtml() {
    var list = emptyCircles();
    if (!list.length) return '';
    var one = list.length === 1;
    var h = '<div class="wh-inv"><div class="wh-inv-h"><div class="wh-inv-i"><i class="fas fa-user-plus"></i></div><div>' +
      '<b>' + esc(one ? 'حلقة «' + list[0].name + '» ليس فيها طلاب بعد' : 'حلقاتك ليس فيها طلاب بعد') + '</b>' +
      '<span>ابدأ بإضافتهم برقم الهوية، ويُجلب الاسم وحده</span></div></div>';
    list.forEach(function (it) {
      h += '<button type="button" class="wh-inv-btn" data-act="addstu" data-circle="' + esc(it.circle_no) + '">' +
        '<i class="fas fa-user-plus"></i> ' + esc(one ? 'أضف طلاب حلقتك' : 'أضف طلاب «' + it.name + '»') + '</button>';
    });
    return h + '</div>';
  }
  function openAdd(circleNo) {
    goTab('studentsTab');
    if (typeof openAddStudentForm === 'function') {
      setTimeout(function () { openAddStudentForm(circleNo); }, 60);
    }
  }
  var _autoOpened = false;
  function maybeAutoOpenEmpty() {
    if (_autoOpened || !isActive()) return;
    var list = emptyCircles();
    for (var i = 0; i < list.length; i++) {
      var k = 'empty_circle_opened:' + list[i].circle_no + ':' + state.user;
      var seen = false;
      try { seen = localStorage.getItem(k) === 'true'; } catch (_) {}
      if (seen) continue;
      try { localStorage.setItem(k, 'true'); } catch (_) {}
      _autoOpened = true;
      openAdd(list[i].circle_no);
      return;
    }
  }
  /* أُضيف طالب (app.js: «انتهيت») ⇒ البطاقات من جديد فتزول الدعوة */
  function studentsAdded() {
    var d = state.insights && state.insights.data;
    if (d && Array.isArray(d.cards)) {
      d.cards = d.cards.filter(function (c) { return c.code !== 'T_EMPTY'; });
    }
    state.fetched.insights = 0;
    if (isActive()) paint();
    refreshAll(false);
  }

  /* يجلب ما قدم — [force] بزرّ التحديث */
  function refreshAll(force) {
    if (!navigator.onLine || !window.QMC || !state.user) return;
    var now = Date.now(), f = state.fetched;
    function due(k, ms) { return force || !f[k] || now - f[k] > ms; }
    var jobs = [];
    if (due('welcome', 30 * 60000)) { f.welcome = now; jobs.push(fetchWelcome().catch(function () {})); }
    if (due('brand', 60 * 60000)) { f.brand = now; jobs.push(fetchBrand().catch(function () {})); }
    if (due('agenda', 30 * 60000)) { f.agenda = now; jobs.push(fetchAgenda().catch(function () {})); }
    if (jobs.length) Promise.all(jobs).then(function () { if (isActive()) paint(); });
    // 🧑‍🏫 يوم المحفّظ يرسم نفسه في #whTday بعد الجلب
    if (window.QmcTeacherDay && due('tday', 2 * 60000)) { f.tday = now; QmcTeacherDay.refresh(); }
    // 🌾 الحصاد يجلب مرّةً في الشهر (load يُبقي ما جُلب) ويرسم نفسه في #whHarvest
    if (window.QmcHarvest && due('harvest', 30 * 60000)) { f.harvest = now; QmcHarvest.refresh(); }
    if (due('insights', 2 * 60000)) {
      f.insights = now;
      // الدعوة والتحية خارج لوحة البطاقات ⇒ رسمٌ كامل، ثم الفتح التلقائيّ مرّة
      fetchInsights().then(function () { if (isActive()) { paint(); maybeAutoOpenEmpty(); } });
    }
  }

  // ── المواعيد ──
  var KINDS = {
    PERSONAL: { label: 'موعدٌ خاصّ', icon: 'fa-user', color: '#0D9488' },
    GROUP: { label: 'موعدٌ جماعيّ', icon: 'fa-users', color: '#CA8A04' },
    EXAM: { label: 'لجنة اختبار', icon: 'fa-gavel', color: '#4F46E5' },
    STUDENT_EXAM: { label: 'اختبار طلابي', icon: 'fa-graduation-cap', color: '#9333EA' },
    CIRCLE: { label: 'حلقة', icon: 'fa-book-open', color: '#16A34A' },
    VISIT: { label: 'زيارة ميدانية', icon: 'fa-person-walking', color: '#D97706' },
    IQRA: { label: 'حصة إقراء', icon: 'fa-microphone-lines', color: '#0284C7' },
    COURSE: { label: 'دورة', icon: 'fa-chalkboard-user', color: '#DB2777' }
  };
  function kindOf(k) { return KINDS[k] || KINDS.PERSONAL; }

  function parseDay(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? null : n; }
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }
  function hhmm(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }

  /* QMC_AGENDA_PKG.occurs_n — 1 الأحد … 7 السبت */
  function occurs(ev, day) {
    var date = parseDay(ev.date);
    if (!date || day < date) return false;
    var until = parseDay(ev.until);
    if (until && day > until) return false;
    switch (String(ev.repeat || 'N')) {
      case 'D': return true;
      case 'W': return daysBetween(date, day) % 7 === 0;
      case 'M': return day.getDate() === date.getDate();
      case 'X':
        return String(ev.days || '').split(':').map(function (x) { return parseInt(x, 10); })
          .indexOf(day.getDay() + 1) !== -1;
      default: return daysBetween(date, day) === 0;
    }
  }

  /* مواعيد اليوم الباقية ثم ما بعده حتى 14 يومًا (نسخة AgendaService.upcoming) */
  function upcoming() {
    var a = state.agenda;
    if (!a) return null;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var last = new Date(today); last.setDate(last.getDate() + 14);
    var out = [];
    function add(day, start, end, title, kind) {
      if (daysBetween(today, day) === 0 && start != null && (end != null ? end : start) < nowMin) return;
      var time = start == null ? null : clock(start);
      out.push({ day: day, start: start, end: end, title: title || '', kind: kind, time: time });
    }
    (a.events || []).forEach(function (e) {
      if (e.deleted === 'Y' || e.deleted === true) return;
      var st = num(e.start_min), dur = num(e.dur_min);
      for (var d = new Date(today); d <= last; d.setDate(d.getDate() + 1)) {
        if (occurs(e, d)) add(new Date(d), st, st == null ? null : st + (dur || 0), s(e.title), 'PERSONAL');
      }
    });
    (a.derived || []).forEach(function (i) {
      var d = parseDay(i.date);
      if (!d || d < today || d > last) return;
      var st = num(i.start_min);
      var n0 = out.length;
      add(d, st, num(i.end_min), s(i.title), s(i.kind) || 'PERSONAL');
      // حلقةٌ بلا موعدٍ مضبوط: وقت صلاتها («مغربا») في note
      var prayer = (i.kind === 'CIRCLE' && st == null) ? s(i.note) : null;
      if (prayer && out.length > n0) out[out.length - 1].time = prayer;
    });
    (a.group || []).forEach(function (g) {
      if (g.active === 'N') return;
      var d = parseDay(g.date);
      if (!d || d < today || d > last) return;
      var st = num(g.start_min), dur = num(g.dur_min);
      add(d, st, st == null ? null : st + (dur || 0), s(g.title), 'GROUP');
    });
    out.sort(function (x, y) {
      var dd = x.day - y.day;
      return dd !== 0 ? dd : (x.start == null ? -1 : x.start) - (y.start == null ? -1 : y.start);
    });
    return out;
  }

  /* حلقات اليوم لسطر المعلّم — كلّها ولو انتهت */
  function todayCircles() {
    var a = state.agenda;
    if (!a) return [];
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return (a.derived || []).filter(function (i) {
      var d = parseDay(i.date);
      return i.kind === 'CIRCLE' && d && daysBetween(today, d) === 0;
    }).map(function (i) {
      var st = num(i.start_min);
      return { title: s(i.title) || '', start: st, end: num(i.end_min), prayer: st == null ? s(i.note) : null };
    }).sort(function (x, y) {
      return (x.start == null ? 9999 : x.start) - (y.start == null ? 9999 : y.start);
    });
  }

  function dayLabel(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = daysBetween(today, d);
    if (diff === 0) return 'اليوم';
    if (diff === 1) return 'غدًا';
    return AR_DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }

  // ── الأنماط ──
  function injectCss() {
    if (document.getElementById('whCss')) return;
    var css =
      '.wh{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px}' +
      '.wh-hero{border-radius:20px;padding:16px;color:#fff;position:relative;cursor:default}' +
      '.wh-hero.compact{cursor:pointer}' +
      '@media (prefers-reduced-motion:no-preference){.wh-hero{animation:whIn .38s cubic-bezier(.2,.8,.2,1)}}' +
      '@keyframes whIn{from{opacity:.35;transform:translateY(6px)}to{opacity:1;transform:none}}' +
      '.wh-id{display:flex;align-items:center;gap:12px}' +
      '.wh-logo{width:50px;height:50px;flex:0 0 50px;border-radius:13px;background:rgba(255,255,255,.92);' +
      'display:flex;align-items:center;justify-content:center;padding:5px;box-sizing:border-box}' +
      '.wh-logo img{max-width:100%;max-height:100%;object-fit:contain}' +
      '.wh-org{font-weight:700;font-size:15.5px;line-height:1.3}' +
      '.wh-job{font-size:12.5px;opacity:.85}' +
      '.wh-edit{margin-inline-start:auto;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);' +
      'color:#fff;border-radius:10px;width:36px;height:36px;flex:0 0 36px;cursor:pointer}' +
      ".wh-motto{font-family:'QmcAmiri','Amiri',serif;font-size:19px;line-height:1.7;text-align:center;margin-top:12px}" +
      '.wh-src{font-size:11px;opacity:.85;text-align:center}' +
      '.wh-greet{display:flex;align-items:center;gap:8px;font-weight:700;font-size:21px;margin-top:14px}' +
      '.wh-hero.compact .wh-greet{font-size:17px;margin-top:10px}' +
      '.wh-greet .wh-more{margin-inline-start:auto;font-size:14px;opacity:.85}' +
      '.wh-date{font-size:12.5px;opacity:.85;margin-top:2px}' +
      '.wh-msg{margin-top:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.14);' +
      'border:1px solid rgba(255,255,255,.22)}' +
      ".wh-quote{font-family:'QmcAmiri','Amiri',serif;font-size:17px;line-height:1.75}" +
      '.wh-qsrc{font-size:11px;opacity:.85}' +
      '.wh-sep{height:1px;background:rgba(255,255,255,.2);margin:8px 0}' +
      '.wh-line{font-size:14.5px;line-height:1.5}' +
      '.wh-cline{font-size:13.5px;line-height:1.45;opacity:.85;margin-top:4px;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.wh-occ{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;' +
      'background:#FBF4E4;border:1px solid rgba(154,107,31,.4);color:#3F2E10}' +
      '.wh-occ>i{color:#9A6B1F;font-size:20px;margin-top:2px}' +
      '.wh-occ-t{color:#9A6B1F;font-weight:700;font-size:15px}' +
      ".wh-occ-q{font-family:'QmcAmiri','Amiri',serif;font-size:16px;line-height:1.7;margin-top:4px}" +
      '.wh-occ-s{font-size:11px;color:#6b7280}' +
      '.wh-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;background:#fff;' +
      'border:1px solid #e0e0e0;cursor:pointer;text-align:start;width:100%;font:inherit;color:inherit}' +
      '.wh-cal{position:relative;width:46px;height:46px;flex:0 0 46px;border-radius:12px;background:rgba(27,94,32,.1);' +
      'display:flex;align-items:center;justify-content:center;color:#1B5E20;font-size:22px}' +
      '.wh-badge{position:absolute;top:-4px;inset-inline-end:-4px;background:#c62828;color:#fff;font-size:11px;' +
      'min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px}' +
      '.wh-card-b{flex:1;min-width:0}' +
      '.wh-card-h{font-size:13px;font-weight:700;color:#1B5E20;margin-bottom:4px}' +
      '.wh-muted{font-size:13.5px;color:#6b7280}' +
      '.wh-when{font-size:13px;font-weight:600}' +
      '.wh-title{font-size:15px;font-weight:600;line-height:1.35;margin-top:3px;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.wh-chev{color:#9e9e9e}' +
      '.wh-last{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:12px;border:0;' +
      'background:var(--primary-wash);color:var(--primary-dark,var(--primary));cursor:pointer;font:inherit;width:100%;text-align:start}' +
      '.wh-last span{flex:1;font-size:14px}.wh-last b{font-weight:600}' +
      '.wh-sec{display:flex;align-items:center;gap:6px;margin:4px 4px 0}' +
      '.wh-sec h3{flex:1;margin:0;font-size:15px;font-weight:700;color:var(--primary-dark,var(--primary))}' +
      '.wh-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
      '@media (min-width:560px){.wh-grid{grid-template-columns:repeat(4,1fr)}}' +
      '.wh-tile{height:84px;border-radius:14px;border:1px solid #e0e0e0;background:#fff;cursor:pointer;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font:inherit;color:inherit;padding:4px}' +
      '.wh-tile i{font-size:24px;color:var(--primary)}' +
      '.wh-tile span{font-size:13.5px;font-weight:500;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.wh-ib{background:none;border:0;color:#6b7280;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:15px}' +
      '.wh-ins{display:flex;flex-direction:column;gap:10px}' +
      '.wh-ic{border:1px solid #e0e0e0;border-radius:14px;background:#fff;overflow:hidden}' +
      '.wh-ic-h{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;cursor:pointer;' +
      'border-inline-start:4px solid var(--c)}' +
      '.wh-ic-n{width:42px;height:42px;flex:0 0 42px;border-radius:11px;background:var(--s);color:var(--c);' +
      'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}' +
      '.wh-ic-t{font-size:15px;font-weight:600}' +
      '.wh-ic-w{font-size:13px;color:#6b7280;line-height:1.4;margin-top:3px}' +
      '.wh-ic:not(.open) .wh-ic-w{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.wh-ic-row{padding:9px 16px;border-top:1px solid #f0f0f0}' +
      '.wh-ic-row b{font-size:14px;font-weight:600;display:block}' +
      '.wh-ic-row small{font-size:12px;color:#757575;display:block}' +
      '.wh-ic-row div{font-size:13px;line-height:1.4;color:var(--c);margin-top:3px}' +
      '.wh-ic-go{margin:4px 12px 12px;border:0;border-radius:18px;padding:8px 14px;background:var(--s);color:var(--c);' +
      'font:inherit;font-size:13.5px;cursor:pointer}' +
      '.wh-note{padding:10px;border-radius:12px;background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;font-size:13.5px}' +
      '.wh-clear{padding:22px;border-radius:16px;background:#F0FDF4;border:1px solid #BBF7D0;text-align:center;color:#166534}' +
      '.wh-clear i{font-size:34px}.wh-clear b{display:block;margin:8px 0 4px;font-size:16px}' +
      '.wh-clear span{color:#6b7280;font-size:13.5px}' +
      '.wh-skel{height:66px;border-radius:14px;background:#f2f2f2}' +
      '.wh-inv{padding:16px;border-radius:16px;background:var(--primary-wash,#EEF4FF);border:1px solid var(--primary-line,#C7D7F5)}' +
      '.wh-inv-h{display:flex;align-items:center;gap:12px;margin-bottom:12px}' +
      '.wh-inv-i{width:48px;height:48px;flex:0 0 48px;border-radius:12px;background:#fff;display:flex;' +
      'align-items:center;justify-content:center;color:var(--primary);font-size:22px}' +
      '.wh-inv-h b{display:block;font-size:16px;color:var(--primary-dark,var(--primary))}' +
      '.wh-inv-h span{font-size:13px;color:#6b7280}' +
      '.wh-inv-btn{display:block;width:100%;min-height:48px;margin-top:6px;border:0;border-radius:24px;' +
      'background:var(--primary);color:#fff;font:inherit;font-size:15.5px;font-weight:700;cursor:pointer}' +
      '.wh-ag-row{display:flex;gap:10px;align-items:flex-start;padding:10px 2px;border-bottom:1px solid #f0f0f0}' +
      '.wh-ag-row i{width:20px;text-align:center;margin-top:3px}' +
      '.wh-ag-day{font-weight:700;font-size:13.5px;color:var(--primary-dark,var(--primary));margin:12px 2px 2px}' +
      '.wh-form label{display:block;font-weight:600;margin:12px 0 6px;font-size:14px}' +
      '.wh-form textarea,.wh-form input[type=text]{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;' +
      'border-radius:10px;padding:10px;font:inherit;font-size:15px}' +
      ".wh-form textarea{font-family:'QmcAmiri','Amiri',serif;font-size:18px;line-height:1.6;resize:vertical}" +
      '.wh-form .wh-hint{font-size:13px;color:#6b7280;margin:2px 0 6px}' +
      '.wh-seg{display:flex;flex-direction:column;gap:6px}' +
      '.wh-seg label{display:flex;gap:8px;align-items:center;font-weight:500;margin:0;padding:10px;border:1px solid #e0e0e0;border-radius:10px;cursor:pointer}' +
      '.wh-prev{margin-top:8px;padding:14px;border-radius:14px;color:#fff;text-align:center;' +
      'background:linear-gradient(90deg,#2F7FA8,#1F6B55)}' +
      '.wh-msgbox{margin-top:12px;padding:10px;border-radius:10px;font-size:13.5px}' +
      // الليليّ يقلب الصفحة كلّها: السماء والمناسبة تُعادان لألوانهما، والصورة داخلها لا تُقلب ثالثةً
      'html.qmc-dark .wh-hero img,html.qmc-dark .wh-prev img{filter:none}';
    var st = document.createElement('style');
    st.id = 'whCss';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── الرسم ──
  function root() { return document.getElementById('homeRoot'); }
  function isActive() {
    var t = document.getElementById('homeTab');
    return !!(t && t.classList.contains('active'));
  }

  function heroHtml(role, w) {
    var now = state.now;
    var p = periodOf(now);
    var occ = occasionOf(now);
    var a = access() || {};
    var name = firstNameOf(a.name_ar);
    var greet = (occ && occ.greeting) || GREET[p];
    var org = w.root_name || (state.brand && state.brand.name) || '';
    var title = s(a.job_name) || ROLE_TITLE[role];
    var withQuote = w.quote_mode !== 'WORDS';
    var base = messageFor(now, role, withQuote);
    var nowD = new Date();
    // 👥 حلقته بلا طلاب ⇒ الخطوة الأولى لا «يسّر الله لك ولطلابك»، ما لم
    //    تكن له اليوم حلقةٌ فيها طلاب (نظير welcome_home_screen._hero)
    var empty = role === 'teacher' ? emptyCircles() : [];
    var todayC = todayCircles().filter(function (c) {
      return !empty.some(function (e) { return String(c.title).indexOf(e.name) !== -1; });
    });
    var real = empty.length && !todayC.length
      ? (empty.length === 1
        ? 'حلقة «' + empty[0].name + '» جاهزة؛ ابدأ بإضافة طلابك، وبهم تبدأ الحلقة.'
        : 'حلقاتك جاهزة؛ ابدأ بإضافة طلابك، وبهم تبدأ الحلقة.')
      : role === 'teacher' ? circleLineFor(todayC, nowD.getHours() * 60 + nowD.getMinutes()) : null;
    var line = real || base.line;
    var hijri = hijriLabel(now);
    var compact = !!state.compact;
    var sky = SKY[p];
    var logo = state.brand && state.brand.b64
      ? 'data:image/png;base64,' + state.brand.b64 : 'app-icon.png';

    var h = '<div class="wh-hero qmc-noinvert' + (compact ? ' compact' : '') + '" id="whHero"' +
      ' style="background:linear-gradient(135deg,' + sky[0] + ',' + sky[1] + ')"' +
      (compact ? ' role="button" tabindex="0" aria-label="عرض التحية كاملة"' : '') + '>';
    h += '<div class="wh-id"><div class="wh-logo"><img src="' + logo + '" alt=""></div><div>';
    if (org) h += '<div class="wh-org">' + esc(org) + '</div>';
    h += '<div class="wh-job">' + esc(title) + '</div></div>';
    if (state.canEdit) {
      h += '<button type="button" class="wh-edit" data-act="edit" title="تخصيص الصفحة الرئيسية" aria-label="تخصيص الصفحة الرئيسية">' +
        '<i class="fas fa-pen"></i></button>';
    }
    h += '</div>';
    if (w.show_motto && !compact) {
      h += '<div class="wh-motto">﴿' + esc(w.motto) + '﴾</div>';
      if (w.motto_src) h += '<div class="wh-src">' + esc(w.motto_src) + '</div>';
    }
    h += '<div class="wh-greet"><i class="fas ' + PERIOD_ICON[p] + '"></i><span>' +
      esc(name ? greet + '، أ. ' + name : greet) + '</span>' +
      (compact ? '<i class="fas fa-chevron-down wh-more"></i>' : '') + '</div>';
    if (!compact) {
      h += '<div class="wh-date">' + esc(gregorianLabel(now) + (hijri ? '  ·  ' + hijri : '')) + '</div>';
      h += '<div class="wh-msg">';
      if (base.quote) {
        h += '<div class="wh-quote">' + esc(base.quote.text) + '</div>' +
          '<div class="wh-qsrc">' + esc(base.quote.source) + '</div><div class="wh-sep"></div>';
      }
      h += '<div class="wh-line">' + esc(line) + '</div></div>';
    } else {
      h += '<div class="wh-cline">' + esc(line) + '</div>';
    }
    return h + '</div>';
  }

  function occasionHtml(w) {
    var o = occasionOf(state.now);
    if (!o) return '';
    var q = w.quote_mode !== 'WORDS' ? o.quote : null;
    var h = '<div class="wh-occ qmc-noinvert"><i class="fas ' + (OCC_ICON[o.key] || 'fa-star') + '"></i><div>' +
      '<div class="wh-occ-t">' + esc(o.title) + '</div>';
    if (q) {
      h += '<div class="wh-occ-q">' + esc(q.text) + '</div><div class="wh-occ-s">' + esc(q.source) + '</div>';
    } else {
      h += '<div style="font-size:13.5px;line-height:1.45;margin-top:2px">' + esc(o.line) + '</div>';
    }
    return h + '</div></div>';
  }

  function agendaHtml() {
    var list = upcoming();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayN = list ? list.filter(function (e) { return daysBetween(today, e.day) === 0; }).length : 0;
    var next = list && list[0];
    var body;
    if (!list) {
      body = '<div class="wh-muted">' + (navigator.onLine ? '…' : 'تظهر مواعيدك هنا متى اتّصلت') + '</div>';
    } else if (!next) {
      body = '<div class="wh-muted">لا مواعيد في الأسبوعين القادمين</div>';
    } else {
      var k = kindOf(next.kind);
      var more = todayN - (daysBetween(today, next.day) === 0 ? 1 : 0);
      body = '<div class="wh-when" style="color:' + k.color + '"><i class="fas ' + k.icon + '"></i> ' +
        esc(dayLabel(next.day) + ' · ' + (next.time || 'طوال اليوم')) + '</div>' +
        '<div class="wh-title">' + esc(next.title || k.label) + '</div>';
      if (more > 0) {
        body += '<div class="wh-muted" style="font-size:12.5px;margin-top:3px">' +
          (more === 1 ? 'وموعدٌ آخر اليوم' : more === 2 ? 'وموعدان آخران اليوم' : 'و' + more + ' مواعيد أخرى اليوم') +
          '</div>';
      }
    }
    return '<button type="button" class="wh-card" data-act="agenda">' +
      '<div class="wh-cal"><i class="fas fa-calendar-days"></i>' +
      (todayN > 0 ? '<span class="wh-badge">' + todayN + '</span>' : '') + '</div>' +
      '<div class="wh-card-b"><div class="wh-card-h">مواعيدي</div>' + body + '</div>' +
      '<i class="fas fa-chevron-left wh-chev"></i></button>';
  }

  /* التبويبات الظاهرة للمستخدم (applyAccessToTabs) — بلا الرئيسية */
  function visibleTabs() {
    return Array.prototype.slice.call(document.querySelectorAll('.tabs-header .tab-btn[data-tab]'))
      .filter(function (b) { return b.dataset.tab !== 'homeTab' && b.style.display !== 'none'; })
      .map(function (b, i) {
        var ic = b.querySelector('i');
        var lb = b.querySelector('span');
        return { id: b.dataset.tab, icon: ic ? ic.className : 'fas fa-circle', label: lb ? lb.textContent.trim() : b.dataset.tab, order: i };
      });
  }

  function shortcutsHtml() {
    var tabs = visibleTabs();
    if (!tabs.length) return '';
    var use = tabUse(state.user);
    tabs.sort(function (a, b) {
      var d = (use[b.id] || 0) - (use[a.id] || 0);
      return d !== 0 ? d : a.order - b.order;
    });
    var last = null;
    try { last = localStorage.getItem('tab_last:' + state.user); } catch (_) {}
    var lastTab = tabs.filter(function (t) { return t.id === last; })[0];
    var h = '';
    if (lastTab) {
      h += '<button type="button" class="wh-last" data-act="tab" data-tab="' + esc(lastTab.id) + '">' +
        '<i class="fas fa-clock-rotate-left"></i><span>أكمل من حيث توقّفت: <b>' + esc(lastTab.label) + '</b></span>' +
        '<i class="fas fa-chevron-left"></i></button>';
    }
    h += '<div class="wh-sec"><h3>إلى أين اليوم؟</h3>' +
      '<button type="button" class="help-btn" data-help="home" title="شرح الشاشة" aria-label="شرح الشاشة"><i class="fas fa-question"></i></button>' +
      '</div><div class="wh-grid">';
    tabs.forEach(function (t) {
      h += '<button type="button" class="wh-tile" data-act="tab" data-tab="' + esc(t.id) + '">' +
        '<i class="' + esc(t.icon) + '"></i><span>' + esc(t.label) + '</span></button>';
    });
    return h + '</div>';
  }

  // ── 🧭 يحتاج تدخّلك ──
  var SEV = {
    crit: { rank: 0, c: '#9F1239', s: '#FFF1F2' },
    warn: { rank: 1, c: '#92400E', s: '#FFFBEB' },
    set: { rank: 2, c: 'var(--primary)', s: 'var(--primary-wash)' },
    info: { rank: 3, c: '#1D5F8A', s: '#EFF6FF' },
    ok: { rank: 4, c: '#166534', s: '#F0FDF4' }
  };
  function sevOf(x) { return SEV[x] || SEV.info; }
  // ما يُفتح هنا — والباقي (لوحة المؤشّرات، الإعداد…) في أندرويد
  var TARGET = { ACTIVITY: ['activityTab', 'سجّل النشاط'], MY_COURSES: ['myCoursesTab', 'دوراتي'], INBOX: ['inbox', 'صندوق الرسائل'] };
  function targetOf(c) {
    var t = TARGET[c.open];
    if (!t) return null;
    if (t[0] === 'inbox') return typeof openInbox === 'function' ? t : null;
    var b = document.querySelector('.tab-btn[data-tab="' + t[0] + '"]');
    return b && b.style.display !== 'none' ? t : null;
  }

  function insightsShown() {
    var d = state.insights && state.insights.data;
    if (!d) return false;
    var r = d.roles || {};
    return ['teacher', 'supervisor', 'org_admin', 'course_teacher', 'course_sup']
      .some(function (k) { return r[k] === 'Y'; });
  }

  function insightsInner() {
    var ins = state.insights;
    var d = ins && ins.data;
    var h = '<div class="wh-sec"><h3>يحتاج تدخّلك</h3>' +
      (d && d.at && !state.insightsBusy ? '<small class="wh-muted" style="font-size:12px">حُدّث ' + esc(String(d.at).substring(11, 16)) + '</small>' : '') +
      '<button type="button" class="wh-ib" data-act="refresh" title="تحديث" aria-label="تحديث">' +
      '<i class="fas fa-rotate' + (state.insightsBusy ? ' fa-spin' : '') + '"></i></button></div>';
    if (!d) {
      return h + '<div class="wh-skel"></div><div class="wh-skel"></div>';
    }
    if (state.insightsErr) h += '<div class="wh-note"><i class="fas fa-cloud"></i> ' + esc(state.insightsErr) + '</div>';
    if (!navigator.onLine && ins.at) {
      var t = new Date(ins.at);
      h += '<div class="wh-note"><i class="fas fa-cloud"></i> لا اتصال — هذه نسخة ' +
        t.getDate() + '/' + (t.getMonth() + 1) + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) +
        '، وتتحدّث متى عاد الاتصال</div>';
    }
    // T_EMPTY دعوةٌ تحت التحية (inviteHtml) لا بطاقة هنا
    var cards = (Array.isArray(d.cards) ? d.cards : []).filter(function (c) {
      return c.code !== 'T_EMPTY';
    }).sort(function (a, b) {
      return sevOf(a.sev).rank - sevOf(b.sev).rank;
    });
    if (!cards.length && emptyCircles().length) return h;
    if (!cards.length) {
      return h + '<div class="wh-clear"><i class="fas fa-circle-check"></i><b>لا شيء يحتاج تدخّلك الآن</b>' +
        '<span>حين يغيب طالبٌ أو تنقطع حلقةٌ أو يهبط حفظٌ تظهر هنا بطاقةٌ بسببها.</span></div>';
    }
    cards.forEach(function (c, idx) {
      var sv = sevOf(c.sev);
      var items = Array.isArray(c.items) ? c.items : [];
      var code = String(c.code || idx);
      var open = !!state.open[code];
      var count = parseInt(c.count, 10);
      if (isNaN(count)) count = items.length;
      var tgt = targetOf(c);
      h += '<div class="wh-ic' + (open ? ' open' : '') + '" style="--c:' + sv.c + ';--s:' + sv.s + '">' +
        '<div class="wh-ic-h" data-act="' + (items.length ? 'toggle' : (tgt ? 'go' : '')) + '" data-code="' + esc(code) + '"' +
        (tgt ? ' data-target="' + tgt[0] + '"' : '') + '>' +
        '<div class="wh-ic-n">' + (c.sev === 'set' ? '<i class="fas fa-sliders"></i>' : count) + '</div>' +
        '<div style="flex:1;min-width:0"><div class="wh-ic-t">' + esc(c.title) + '</div>' +
        (s(c.why) ? '<div class="wh-ic-w">' + esc(c.why) + '</div>' : '') + '</div>' +
        '<i class="fas ' + (items.length ? (open ? 'fa-chevron-up' : 'fa-chevron-down') : (tgt ? 'fa-chevron-left' : '')) + ' wh-chev"></i></div>';
      if (open) {
        items.forEach(function (it) {
          h += '<div class="wh-ic-row"><b>' + esc(it.name) + '</b>' +
            (s(it.sub) ? '<small>' + esc(it.sub) + '</small>' : '') +
            (s(it.reason) ? '<div>' + esc(it.reason) + '</div>' : '') + '</div>';
        });
        if (count > items.length) {
          h += '<div class="wh-ic-row"><small>وغيرهم ' + (count - items.length) + '</small></div>';
        }
        if (tgt) {
          h += '<button type="button" class="wh-ic-go" data-act="go" data-target="' + tgt[0] + '">' +
            '<i class="fas fa-arrow-up-right-from-square"></i> ' + esc(tgt[1]) + '</button>';
        }
      }
      h += '</div>';
    });
    return h;
  }

  function paintInsights() {
    var el = document.getElementById('whIns');
    if (!el) return;
    // لمن له دورٌ فيها وحده (InsightService.showTab) — والدور يُعرف من أوّل ردّ
    if (!insightsShown()) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = insightsInner();
  }

  function paint() {
    var r = root();
    if (!r) return;
    injectCss();
    var u = syncUser();
    if (state.compact === null || state.compactUser !== u) {
      if (!u) return;
      state.compact = !firstInPeriod(u, dayKey(state.now) + '|' + periodOf(state.now));
      state.compactUser = u;
    }
    var w = welcomeNow();
    var role = roleOf();
    r.innerHTML = '<div class="wh">' +
      heroHtml(role, w) +
      occasionHtml(w) +
      inviteHtml() +
      agendaHtml() +
      // 🧑‍🏫 يوم المحفّظ (2026-11-13، teacher_day.js): نيابتي · حلقاتي «لن أحضر» ·
      //    «المحفّظون اليوم» — يغيب لمن لا شيء له فيه
      '<div id="whTday" style="display:none"></div>' +
      shortcutsHtml() +
      // 🌾 حصاد الشهر (harvest.js) — أعلى «يحتاج تدخّلك» كأندرويد (2026-11-13)
      '<div id="whHarvest"></div>' +
      '<div id="whIns" class="wh-ins" style="display:none"></div>' +
      '</div>';
    paintInsights();
    if (window.QmcTeacherDay) { try { QmcTeacherDay.paintHome(); } catch (_) {} }
    if (window.QmcHarvest && QmcHarvest.paintHome) { try { QmcHarvest.paintHome(); } catch (_) {} }
    if (typeof _helpMarkDots === 'function') { try { _helpMarkDots(); } catch (_) {} }
  }

  // ── التفاعل ──
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    var hero = e.target.closest('#whHero');
    if (!el) {
      if (hero && state.compact) { state.compact = false; paint(); }
      return;
    }
    var act = el.dataset.act;
    if (act === 'edit') { e.stopPropagation(); openSettingsDialog(); }
    else if (act === 'agenda') openAgendaList();
    else if (act === 'tab') goTab(el.dataset.tab);
    else if (act === 'addstu') openAdd(Number(el.dataset.circle));
    else if (act === 'refresh') {
      state.fetched.insights = 0;
      state.fetched.tday = 0;
      refreshAll(true);
    } else if (act === 'toggle') {
      var c = el.dataset.code;
      state.open[c] = !state.open[c];
      paintInsights();
    } else if (act === 'go') {
      var t = el.dataset.target;
      if (t === 'inbox') { if (typeof openInbox === 'function') openInbox(); }
      else goTab(t);
    } else if (act === '') {
      /* بطاقةٌ بلا قائمةٍ ولا وجهة */
    }
  }

  function goTab(id) {
    var b = document.querySelector('.tab-btn[data-tab="' + id + '"]');
    if (b && typeof openTab === 'function') openTab(id, b);
  }

  // ── 📅 قائمة المواعيد (قراءةً — الإضافة والتعديل في أندرويد) ──
  function overlay(id, inner) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var o = document.createElement('div');
    o.id = id;
    o.className = 'modal-overlay';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.style.display = 'flex';
    o.innerHTML = '<div class="modal-box" style="max-height:86vh;overflow:auto;text-align:start">' + inner + '</div>';
    o.addEventListener('click', function (ev) {
      if (ev.target === o || ev.target.closest('[data-close]')) o.remove();
    });
    document.body.appendChild(o);
    return o;
  }

  function openAgendaList() {
    var list = upcoming();
    var h = '<h4 class="modal-title">مواعيدي — الأسبوعان القادمان</h4>';
    if (!list) {
      h += '<p class="wh-muted">' + (navigator.onLine ? 'جارٍ الجلب…' : 'لا اتصال، ولم تُجلب المواعيد بعد على هذا الجهاز.') + '</p>';
    } else if (!list.length) {
      h += '<p class="wh-muted">لا مواعيد في الأسبوعين القادمين.</p>';
    } else {
      var lastKey = '';
      list.forEach(function (e) {
        var k = kindOf(e.kind);
        var key = dayKey(e.day);
        if (key !== lastKey) {
          h += '<div class="wh-ag-day">' + esc(dayLabel(e.day) + (daysBetween(new Date(new Date().setHours(0, 0, 0, 0)), e.day) > 1 ? '' : ' · ' + AR_DAYS[e.day.getDay()])) + '</div>';
          lastKey = key;
        }
        h += '<div class="wh-ag-row"><i class="fas ' + k.icon + '" style="color:' + k.color + '"></i><div>' +
          '<div style="font-weight:600">' + esc(e.title || k.label) + '</div>' +
          '<div class="wh-muted" style="font-size:12.5px">' + esc((e.time || 'طوال اليوم') +
            (e.start != null && e.end != null && e.end > e.start ? ' – ' + clock(Math.min(e.end, 1439)) : '') +
            ' · ' + k.label) + '</div></div></div>';
      });
    }
    var at = state.agenda && state.agenda.at;
    if (at) {
      var t = new Date(at);
      h += '<p class="wh-muted" style="font-size:12px;margin-top:10px">آخر تحديث ' + t.getDate() + '/' + (t.getMonth() + 1) +
        ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + '</p>';
    }
    h += '<div class="modal-actions"><button type="button" class="modal-btn modal-cancel" data-close>إغلاق</button></div>';
    overlay('whAgendaModal', h);
  }

  // ── ⚙️ تخصيص الصفحة الرئيسية (مدير المؤسسة — والفرض على السيرفر) ──
  function openSettingsDialog() {
    var w = welcomeNow();
    var h = '<h4 class="modal-title">تخصيص الصفحة الرئيسية</h4>' +
      (w.root_name ? '<div class="wh-muted">لكلّ موظفي ' + esc(w.root_name) + '</div>' : '') +
      '<div class="wh-form">' +
      '<label>آية المؤسسة</label><div class="wh-hint">تظهر ثابتةً تحت اسم المؤسسة وشعارها في أعلى الصفحة الرئيسية.</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="whShow"' +
      (w.show_motto ? ' checked' : '') + '> عرض الآية</label>' +
      '<div id="whMottoBox">' +
      '<label for="whMotto">نصّ الآية (دون الأقواس ﴿﴾)</label><textarea id="whMotto" rows="3" maxlength="300" dir="rtl">' + esc(w.motto) + '</textarea>' +
      '<label for="whSrc">السورة ورقم الآية</label><input type="text" id="whSrc" maxlength="60" placeholder="فاطر: 32" value="' + esc(w.motto_src) + '">' +
      '<div class="wh-prev qmc-noinvert" id="whPrev"></div></div>' +
      '<label>رسالة التحية</label><div class="wh-hint">تتغيّر مع وقت الدخول (الصباح، الظهر، العصر، المساء، الليل) ومع دور الموظف.</div>' +
      '<div class="wh-seg">' +
      '<label><input type="radio" name="whMode" value="BOTH"' + (w.quote_mode !== 'WORDS' ? ' checked' : '') + '> آياتٌ وأحاديث مع التحفيز</label>' +
      '<label><input type="radio" name="whMode" value="WORDS"' + (w.quote_mode === 'WORDS' ? ' checked' : '') + '> عباراتٌ تحفيزية وحدها</label>' +
      '</div><div id="whMsg"></div></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="modal-btn modal-cancel" data-close>إغلاق</button>' +
      (w.custom ? '<button type="button" class="modal-btn modal-cancel" id="whReset">الافتراضيّ</button>' : '') +
      '<button type="button" class="modal-btn modal-confirm" id="whSave">احفظ</button></div>';
    var o = overlay('whSetModal', h);

    var show = o.querySelector('#whShow'), motto = o.querySelector('#whMotto'), src = o.querySelector('#whSrc');
    var prev = o.querySelector('#whPrev'), box = o.querySelector('#whMottoBox'), save = o.querySelector('#whSave');
    function upd() {
      box.style.display = show.checked ? '' : 'none';
      var m = motto.value.trim().replace(/[﴿﴾]/g, '');
      prev.style.display = m ? '' : 'none';
      prev.innerHTML = '<div class="wh-motto" style="margin:0">﴿' + esc(m) + '﴾</div>' +
        (src.value.trim() ? '<div class="wh-src">' + esc(src.value.trim()) + '</div>' : '');
      save.disabled = show.checked && !m;
    }
    [show, motto, src].forEach(function (x) { x.addEventListener('input', upd); x.addEventListener('change', upd); });
    upd();

    async function send(action) {
      var msg = o.querySelector('#whMsg');
      var mode = (o.querySelector('input[name="whMode"]:checked') || {}).value || 'BOTH';
      save.disabled = true;
      msg.innerHTML = '<div class="wh-msgbox wh-muted">جارٍ الحفظ…</div>';
      try {
        var r = await QMC.apiFetch('org/welcome', {
          method: 'POST',
          body: {
            root_no: w.root_no, action: action,
            motto: motto.value.trim().replace(/[﴿﴾]/g, ''), motto_src: src.value.trim(),
            show_motto: show.checked ? 'Y' : 'N', quote_mode: mode
          }
        });
        var d = await r.json().catch(function () { return null; });
        if (!d || d.status !== 'success') {
          throw new Error((d && d.message) || (r.status === 404 ? 'الخدمة لم تُفعَّل على الخادم بعد' : 'تعذّر إتمام الطلب (رمز ' + r.status + ')'));
        }
        state.welcome = parseWelcome(d);
        state.canEdit = d.can_edit === 'Y' || state.canEdit;
        lsSet('welcome:' + state.user, state.welcome);
        o.remove();
        paint();
        if (typeof showToast === 'function') {
          showToast(action === 'RESET' ? 'عادت الصفحة إلى الافتراضيّ — يراها موظفو المؤسسة في دخولهم التالي'
            : 'حُفظ — يراه موظفو المؤسسة في دخولهم التالي');
        }
      } catch (err) {
        var m = err && err.name === 'AbortError' ? 'انتهت المهلة — أعد المحاولة'
          : (err && err.message && !/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? err.message
            : 'تعذّر الاتصال بالخادم — تحقّق من الإنترنت وأعد المحاولة');
        msg.innerHTML = '<div class="wh-msgbox" style="background:#FFF1F2;color:#9F1239">' + esc(m) + '</div>';
        upd();
      }
    }
    save.addEventListener('click', function () { send('SAVE'); });
    var reset = o.querySelector('#whReset');
    if (reset) reset.addEventListener('click', function () { send('RESET'); });
  }

  // ── الواجهة العامّة ──
  var _bound = false;
  function render() {
    var r = root();
    if (!r) return;
    if (!_bound) { r.addEventListener('click', onClick); _bound = true; }
    state.now = new Date();
    paint();
    refreshAll(false);
  }

  /* بعد الصلاحيات (الاسم والمسمّى والتبويبات الظاهرة) — يُعاد الرسم إن كانت ظاهرة */
  function refreshIfActive() { if (isActive()) render(); }

  // الفترة تتغيّر والتطبيق مفتوح (الصباح ⇐ الظهر) ⇒ تتغيّر التحية معها؛
  // وموعد اليوم الذي انقضى يُخلي مكانه كل 5 دقائق
  setInterval(function () {
    if (!isActive() || document.hidden) return;
    var n = new Date();
    if (periodOf(n) !== periodOf(state.now) || n.getDate() !== state.now.getDate() || n.getMinutes() % 5 === 0) {
      state.now = n;
      paint();
    }
  }, 60000);

  window.addEventListener('online', function () { if (isActive()) refreshAll(false); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && isActive()) { state.now = new Date(); paint(); refreshAll(false); }
  });

  window.QmcWelcome = {
    render: render,
    refreshIfActive: refreshIfActive,
    noteTab: noteTab,
    emptyCircles: emptyCircles,
    studentsAdded: studentsAdded,
    // 🖼️ بطاقة مشاركة النشاط (share_card.js) — التاريخ بالتقويمين كالتحية
    gregorianLabel: gregorianLabel,
    hijriLabel: hijriLabel,
    // للفحص: نفس اختيار Dart
    _pickIndex: pickIndex,
    _messageFor: messageFor,
    _firstNameOf: firstNameOf,
    _circleLineFor: circleLineFor,
    _occasionOf: occasionOf
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
