# PaperPlane

A fork of [Plane](https://github.com/makeplane/plane) maintained by inomotech, building on the community edition with features we need from the paid tiers.

We publish our own multi-arch container images and Helm chart to GitHub Container Registry.

## Deploy

Helm is the supported deployment method.

```bash
helm install paperplane oci://ghcr.io/inomotech-foss/charts/paperplane --version <version>
```

Configuration and prerequisites: [deployments/helm/paperplane](deployments/helm/paperplane/README.md).

Images: `ghcr.io/inomotech-foss/paperplane-{frontend,admin,space,live,backend,proxy}` and the all-in-one `paperplane-aio-community`.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE.txt), inherited from Plane. Product documentation lives at [docs.plane.so](https://docs.plane.so/).
