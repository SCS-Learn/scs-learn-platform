export default function CogniterraSetupFields({
  cogniterraCourseId,
  consumerKey,
  sharedSecret,
  existingCourseId,
  onCogniterraCourseIdChange,
  onConsumerKeyChange,
  onSharedSecretChange,
}: {
  cogniterraCourseId: string;
  consumerKey: string;
  sharedSecret: string;
  existingCourseId?: string | null;
  onCogniterraCourseIdChange: (value: string) => void;
  onConsumerKeyChange: (value: string) => void;
  onSharedSecretChange: (value: string) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-md p-4 space-y-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cogniterra</p>
      <p className="text-xs text-gray-500">
        Required when the folder includes coding assignments graded on Cogniterra. Leave blank if
        this course has no Cogniterra activities.
      </p>
      {existingCourseId && (
        <p className="text-xs text-green-700">
          This course is already linked to Cogniterra course {existingCourseId}. Re-enter the shared
          secret only if you are updating credentials.
        </p>
      )}
      <label className="block text-xs text-gray-600">
        Cogniterra course ID
        <input
          type="text"
          value={cogniterraCourseId}
          onChange={(e) => onCogniterraCourseIdChange(e.target.value)}
          placeholder="e.g. 782"
          className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs text-gray-600">
        LTI consumer key
        <input
          type="text"
          value={consumerKey}
          onChange={(e) => onConsumerKeyChange(e.target.value)}
          className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
        />
      </label>
      <label className="block text-xs text-gray-600">
        LTI shared secret
        <input
          type="password"
          value={sharedSecret}
          onChange={(e) => onSharedSecretChange(e.target.value)}
          placeholder={existingCourseId ? "Leave blank to keep existing" : ""}
          className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
        />
      </label>
    </div>
  );
}
