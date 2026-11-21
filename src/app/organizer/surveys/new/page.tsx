import SurveyForm from "../survey-form";

export default function NewSurveyPage() {
  return (
    <main>
      <span className="eyebrow">NEW SURVEY</span>
      <h1>調査を作成</h1>
      <p className="page-intro">基本情報を入力して、まちなかの調査を始めましょう。</p>
      <SurveyForm />
    </main>
  );
}
