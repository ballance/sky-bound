variable "domain_name" {
  description = "The domain name for the Skybound site"
  type        = string
  default     = "skybound.bastionforge.com"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for bastionforge.com"
  type        = string
  default     = "Z05616888O7BYTCZT9PE"
}
