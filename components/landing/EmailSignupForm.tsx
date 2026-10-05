type EmailSignupFormProps = {
  buttonLabel: string;
  placeholder?: string;
  className?: string;
};

export default function EmailSignupForm({
  buttonLabel,
  placeholder = "Enter your email",
  className = "",
}: EmailSignupFormProps) {
  return (
    <form
      className={`flex w-full max-w-[30rem] items-center gap-2 rounded-full bg-gray-light p-1.5 text-left ${className}`}
    >
      <input
        type="email"
        required
        placeholder={placeholder}
        aria-label="Email address"
        className="min-w-0 flex-1 bg-transparent pl-5 text-base sm:pl-6 sm:text-lg text-black placeholder:text-gray-medium focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 whitespace-nowrap rounded-full bg-primary px-5 py-2.5 text-base sm:px-6 sm:py-3 sm:text-lg font-medium text-white hover:bg-primary-dark transition-colors"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
