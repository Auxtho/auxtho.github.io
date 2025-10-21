/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
  ],
  theme: {
    extend: {},
  },
  /* ==== 👇 이 safelist 블록을 추가하세요 ==== */
  safelist: [
    'translate-y-[-100%]', // app.js가 헤더를 숨길 때 사용
  ],
  /* ==================================== */
  plugins: [],
};