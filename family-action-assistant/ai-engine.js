/*
 * 家庭 AI 行动助手：零后端 MVP 解析器
 * 先用本地规则把自然语言整理成事项，后续可以替换成真正的大模型接口。
 */
const ActionAI = {
  weekdayMap: { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 },
  categoryLabels: { childcare: '育儿', family: '家庭', shopping: '购物', other: '其他' },

  _dateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  _addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  },

  _nextWeekday(target) {
    const today = new Date();
    const current = today.getDay();
    let diff = (target - current + 7) % 7;
    if (diff === 0) diff += 7;
    return this._addDays(today, diff);
  },

  _number(value) {
    const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    return /^\d+$/.test(value) ? Number(value) : (map[value] || 1);
  },

  parseDate(text) {
    const now = new Date();
    let date = null;
    let label = '';
    if (/今天/.test(text)) { date = now; label = '今天'; }
    else if (/明天/.test(text)) { date = this._addDays(now, 1); label = '明天'; }
    else if (/后天/.test(text)) { date = this._addDays(now, 2); label = '后天'; }

    const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
    if (monthDay) {
      date = new Date(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
      if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(date.getFullYear() + 1);
      label = `${monthDay[1]}月${monthDay[2]}日`;
    }

    const weekday = text.match(/(?:下周|下星期|这周|本周|周|星期)[一二三四五六日天]/);
    if (weekday) {
      const prefix = weekday[0].replace(/[一二三四五六日天]$/, '');
      date = this._nextWeekday(this.weekdayMap[weekday[0].slice(-1)], prefix.includes('下'));
      label = `${prefix.includes('下') ? '下周' : '周'}${weekday[0].slice(-1)}`;
    }

    const iso = text.match(/20\d{2}[-年](\d{1,2})[-月](\d{1,2})[日]?/);
    if (iso) {
      const year = Number(iso[0].slice(0, 4));
      date = new Date(year, Number(iso[1]) - 1, Number(iso[2]));
      label = `${year}年${iso[1]}月${iso[2]}日`;
    }

    const time = text.match(/(上午|下午|晚上|早上|中午)\s*(\d{1,2})(?::(\d{2}))?\s*(点|时)?|(\d{1,2})(?::(\d{2}))\s*(点|时)?|(\d{1,2})\s*(点|时)/);
    let timeLabel = '';
    if (time) {
      const hourValue = time[2] || time[5] || time[7];
      const minuteValue = time[3] || time[6] || '0';
      if (Number(hourValue) > 23) return { date: date ? this._dateOnly(date) : '', label, time: '' };
      let hour = Number(hourValue);
      if ((time[1] === '下午' || time[1] === '晚上') && hour < 12) hour += 12;
      if (date) date.setHours(hour, Number(minuteValue), 0, 0);
      timeLabel = `${String(hour).padStart(2, '0')}:${String(Number(minuteValue)).padStart(2, '0')}`;
    }

    return { date: date ? this._dateOnly(date) : '', label, time: timeLabel };
  },

  parseReminder(text, date) {
    const match = text.match(/提前([0-9一二三四五六七八九十]+)(天|日|小时|小時)/);
    if (!match || !date) return '';
    const base = new Date(`${date}T09:00:00`);
    const amount = this._number(match[1]) * (match[2].includes('小时') || match[2].includes('小時') ? 1 / 24 : 1);
    return this._dateOnly(this._addDays(base, -amount));
  },

  detectCategory(text, selected = 'auto') {
    if (selected !== 'auto') return selected;
    if (/买|购买|采购|超市|清单|奶粉|尿布|纸尿裤|辅食/.test(text)) return 'shopping';
    if (/宝宝|孩子|疫苗|体检|医院|幼儿园|辅食|喂奶|睡觉|接种/.test(text)) return 'childcare';
    if (/爸爸|妈妈|爷爷|奶奶|外公|外婆|家人|家庭|家里|打扫|缴费/.test(text)) return 'family';
    return 'other';
  },

  extractPeople(text) {
    const people = ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '我'];
    return people.filter(person => text.includes(person)).slice(0, 3);
  },

  extractChecklist(text) {
    const found = [];
    const patterns = [/(?:要带|记得带|需要带|带上|准备)([^，。,.；;]+)/g, /(?:需要|准备)([^，。,.；;]+)/g];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) {
        match[1].split(/和|、|以及|及/).map(item => item.trim()).filter(item => item.length > 0 && item.length < 18)
          .forEach(item => { if (!found.includes(item)) found.push(item); });
      }
    }
    return found.slice(0, 6);
  },

  makeTitle(text, category) {
    const shopping = text.match(/(?:买|购买|采购)([^，。,.；;]+)/);
    if (category === 'shopping' && /奶粉/.test(text)) return '购买奶粉';
    if (category === 'shopping' && shopping) return `购买${shopping[1].trim()}`.replace(/购买购买/, '购买');
    const cleaned = text
      .replace(/(今天|明天|后天)/g, '')
      .replace(/(?:下周|下星期|这周|本周|周|星期)[一二三四五六日天]/g, '')
      .replace(/20\d{2}[-年]\d{1,2}[-月]\d{1,2}[日]?/g, '')
      .replace(/\d{1,2}月\d{1,2}[日号]?/g, '')
      .replace(/(?:上午|下午|晚上|早上|中午)?\s*\d{1,2}(?::\d{2})?\s*(?:点|时)/g, '')
      .replace(/(?:要带|记得带|需要带|带上|准备)[^，。,.；;]+/g, '')
      .replace(/提前[0-9一二三四五六七八九十]+(天|日|小时|小時)/g, '')
      .replace(/提醒(我|爸爸|妈妈)?/g, '')
      .replace(/[，,。；;]+/g, ' ')
      .trim();
    if (cleaned.length <= 24) return cleaned || '家庭待办';
    return `${cleaned.slice(0, 24)}…`;
  },

  parse(text, selectedCategory = 'auto') {
    const raw = String(text || '').trim();
    const category = this.detectCategory(raw, selectedCategory);
    const dateInfo = this.parseDate(raw);
    const checklist = this.extractChecklist(raw);
    const people = this.extractPeople(raw);
    return {
      title: this.makeTitle(raw, category),
      category,
      categoryLabel: this.categoryLabels[category],
      date: dateInfo.date,
      dateLabel: dateInfo.label || '待安排时间',
      time: dateInfo.time,
      reminderDate: this.parseReminder(raw, dateInfo.date),
      checklist,
      people,
      source: raw,
      createdAt: new Date().toISOString()
    };
  }
};

const LedgerAI = {
  categoryLabels: { food: '买菜 / 餐饮', baby: '宝宝用品', medical: '医疗 / 药品', shopping: '日用 / 购物', transport: '交通', other: '其他' },

  _dateOnly(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  _dateFromText(text) {
    const now = new Date();
    const relative = text.match(/今天|昨天|前天|明天/);
    if (relative) {
      const offset = { 今天: 0, 昨天: -1, 前天: -2, 明天: 1 }[relative[0]];
      const date = new Date(now);
      date.setDate(date.getDate() + offset);
      return this._dateOnly(date);
    }
    const fullDate = text.match(/(?:(20\d{2})[-年])?(\d{1,2})[-月](\d{1,2})[日号]?/);
    if (fullDate) {
      const date = new Date(Number(fullDate[1] || now.getFullYear()), Number(fullDate[2]) - 1, Number(fullDate[3]));
      return this._dateOnly(date);
    }
    return this._dateOnly(now);
  },

  parse(text) {
    const raw = String(text || '').trim();
    const withUnit = [...raw.matchAll(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块|人民币)/g)];
    const withVerb = [...raw.matchAll(/(?:花了|用了|支付了|付款了|消费了|共|总共|买了|买)\s*(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)/g)];
    const amountMatch = withUnit[withUnit.length - 1] || withVerb[withVerb.length - 1];
    const amount = amountMatch ? Number(amountMatch[1]) : 0;
    let category = 'other';
    if (/奶粉|尿布|纸尿裤|宝宝|辅食|玩具|童车/.test(raw)) category = 'baby';
    else if (/医院|看病|药|挂号|医疗|体检/.test(raw)) category = 'medical';
    else if (/打车|地铁|公交|停车|加油|交通/.test(raw)) category = 'transport';
    else if (/买菜|吃饭|早餐|午餐|晚餐|餐厅|外卖/.test(raw)) category = 'food';
    else if (/购物|日用|超市|购买|买/.test(raw)) category = 'shopping';
    const payerMatch = raw.match(/爸爸|妈妈|共同|我/);
    const payer = payerMatch ? payerMatch[0] : '我';
    const amountPattern = /(?:花了|用了|支付了|付款了|消费了|共|总共|买了|买)?\s*(?:¥|￥)?\s*\d+(?:\.\d{1,2})?\s*(?:元|块钱|块|人民币)?/g;
    const note = raw
      .replace(/20\d{2}[-年]\d{1,2}[-月]\d{1,2}[日]?|\d{1,2}月\d{1,2}[日号]?/g, '')
      .replace(/今天|昨天|前天|明天/g, '')
      .replace(amountPattern, '')
      .replace(/(?:爸爸|妈妈|共同|我)\s*(?:付的|支付|付款|付了)?/g, '')
      .replace(/[，,。；;：:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    return { amount, date: this._dateFromText(raw), category, payer, note: note || this.categoryLabels[category] };
  }
};

if (typeof window !== 'undefined') window.ActionAI = ActionAI;
if (typeof window !== 'undefined') window.LedgerAI = LedgerAI;
