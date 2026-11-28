# probe plugin: write a marker file during build
require "fileutils"
begin
  FileUtils.mkdir_p(File.join(__dir__, "..", "_probe_out"))
  File.write(File.join(__dir__, "..", "_probe_out", "marker.txt"), "PLUGIN_RAN_OK")
rescue => e
  begin
    File.write(File.join(Dir.pwd, "_probe_out_marker.txt"), "ERR:" + e.to_s)
  rescue
  end
end
