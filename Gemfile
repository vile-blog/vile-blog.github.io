source "https://rubygems.org"

gem "github-pages", group: :jekyll_plugins

group :jekyll_plugins do
  gem "jekyll-feed"
  gem "jekyll-seo-tag"
  gem "jekyll-sitemap"
end

gem "webrick", "~> 1.8"

# Windows has no system zoneinfo database, which makes `timezone:` in
# _config.yml crash local builds with TZInfo::DataSourceNotFound. This
# gem bundles the zoneinfo data so Windows builds work like GitHub
# Pages' Linux build servers already do.
gem "tzinfo-data", platforms: [:windows, :jruby]
