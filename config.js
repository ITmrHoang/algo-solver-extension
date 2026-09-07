// Cấu hình mặc định lúc build extension
// Bạn có thể dán sẵn Google AI Studio API Key và ngôn ngữ mong muốn vào đây
const APP_CONFIG = {
  // Điền API Key của bạn vào đây nếu muốn có sẵn khi load extension:
  DEFAULT_API_KEY: '',
  
  // Ngôn ngữ mặc định ('Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Rust', ...)
  DEFAULT_LANGUAGE: 'Python',
  
  // Model mặc định:
  DEFAULT_MODEL: 'gemini-3.1-flash-lite'
};

// Hỗ trợ cả Service Worker (self) và Popup/Web (window)
if (typeof self !== 'undefined') {
  self.APP_CONFIG = APP_CONFIG;
}
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
}
