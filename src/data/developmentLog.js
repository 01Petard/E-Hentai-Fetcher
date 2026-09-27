// 静态维护：仅记录已确认的开发状态和已发布内容，避免把示例版本写成实际发布记录。
export const inDevelopment = [];

export const roadmap = [
  { title: '更新监控', description: '监控指定作者、Uploader 和关键词的内容更新。', stage: '近期' },
  { title: '收藏夹', description: '收藏画廊，方便稍后查看。', stage: '近期' },
  { title: '搜索历史', description: '保存最近的搜索记录，方便再次查找。', stage: '后续' },
  { title: '标签系统', description: '为收藏内容添加自定义标签。', stage: '后续' },
  { title: '内容推荐', description: '探索基于浏览行为的相关推荐。', stage: '探索中' },
];

export const updates = [
  {
    date: '2026-09-28',
    version: '',
    changes: [
      { type: '新增', content: '开发日志页面' },
    ],
  },
];

export const roadmapStages = ['近期', '后续', '探索中'];
